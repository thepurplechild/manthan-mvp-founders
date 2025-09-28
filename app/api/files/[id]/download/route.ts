import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { FileObject } from '@supabase/storage-js'
import { getAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const maxDuration = 30

const sanitizeStoragePath = (path: string | null) => (path || '').replace(/^\/+/, '')

const createSupabaseClient = async () => {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll() {
          // read-only
        },
      },
    }
  )
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: fileId } = await params
    const supabase = await createSupabaseClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const [scriptUploadResult, ingestionResult] = await Promise.all([
      supabase
        .from('script_uploads')
        .select(`
          *,
          projects!script_uploads_project_id_fkey (
            id,
            owner_id,
            title
          )
        `)
        .eq('id', fileId)
        .maybeSingle(),
      supabase
        .from('ingestions')
        .select(`
          *,
          projects!ingestions_project_id_fkey (
            id,
            owner_id,
            title
          )
        `)
        .eq('id', fileId)
        .maybeSingle(),
    ])

    const scriptUpload = scriptUploadResult.data
    const ingestion = ingestionResult.data

    if (!scriptUpload && !ingestion) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }

    type ProjectRecord = { id: string; owner_id: string; title?: string }
    const project = (scriptUpload?.projects as ProjectRecord | null) ?? (ingestion?.projects as ProjectRecord | null)
    if (!project || project.owner_id !== user.id) {
      return NextResponse.json({ error: 'Access denied - you do not own this file' }, { status: 403 })
    }

    const bucket = scriptUpload?.storage_bucket || 'scripts'
    const rawPath = scriptUpload?.file_path || ingestion?.source_file_url || ''
    const filePath = sanitizeStoragePath(rawPath)
    const fileName = scriptUpload?.file_name || rawPath.split('/').pop() || 'download'

    if (!filePath) {
      return NextResponse.json({ error: 'File path not found' }, { status: 400 })
    }

    const { folder, file } = (() => {
      const segments = filePath.split('/')
      const name = segments.pop() || filePath
      return { folder: segments.join('/'), file: name }
    })()

    const { data: listedObjects, error: listError } = await supabase.storage
      .from(bucket)
      .list(folder === '' ? undefined : folder, {
        search: file,
        limit: 1,
      })

    const storageObjects: FileObject[] = listedObjects ?? []

    if (listError || storageObjects.length === 0) {
      // Persist storage_exists=false for metadata accuracy
      if (scriptUpload) {
        try {
          const admin = getAdminClient()
          await admin
            .from('script_uploads')
            .update({ storage_exists: false, last_verified_at: new Date().toISOString() })
            .eq('id', scriptUpload.id)
        } catch (metaError) {
          console.warn('[file-download] failed to persist missing storage state', metaError)
        }
      }
      return NextResponse.json({ error: 'File not found in storage' }, { status: 404 })
    }

    const url = new URL(request.url)
    const inline = url.searchParams.get('inline') === 'true'
    const expires = Math.min(parseInt(url.searchParams.get('expires') || '3600', 10), 24 * 60 * 60)

    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from(bucket)
      .createSignedUrl(filePath, expires, {
        download: inline ? undefined : fileName,
      })

    if (signedUrlError || !signedUrlData?.signedUrl) {
      console.error('[file-download] failed to generate signed URL', signedUrlError)
      return NextResponse.json({ error: 'Failed to generate download URL' }, { status: 500 })
    }

    console.log(
      JSON.stringify({
        scope: 'file_download',
        event: 'download_url_generated',
        user_id: user.id,
        file_id: fileId,
        file_path: filePath,
        file_name: fileName,
        project_id: project.id,
        project_title: project.title,
        inline,
        expires_in: expires,
        timestamp: new Date().toISOString(),
      })
    )

    if (inline) {
      return NextResponse.redirect(signedUrlData.signedUrl)
    }

    return NextResponse.json({
      download_url: signedUrlData.signedUrl,
      file_name: fileName,
      file_path: filePath,
      expires_at: new Date(Date.now() + expires * 1000).toISOString(),
      expires_in_seconds: expires,
      inline,
      project: {
        id: project.id,
        title: project.title,
      },
      file_info: {
        id: fileId,
        type: scriptUpload ? 'script_upload' : 'ingestion',
        size: scriptUpload?.file_size || null,
        uploaded_at: scriptUpload?.uploaded_at || ingestion?.created_at,
        mime_type: scriptUpload?.mime_type || ingestion?.mime_type || null,
        version: scriptUpload?.version || 1,
      },
    })
  } catch (error) {
    console.error('[file-download] unexpected error', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
