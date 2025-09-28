import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const maxDuration = 30

type FileStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'uploaded' | 'missing'

type DetailedFileResponse = {
  id: string
  project_id: string
  type: 'script_upload' | 'ingestion_only' | 'both'
  storage_bucket: string
  storage_path: string
  storage_exists: boolean
  file_name: string
  mime_type: string | null
  file_size: number | null
  version: number
  checksum: string | null
  status: FileStatus
  uploaded_at: string
  updated_at: string | null
  ingestion: {
    id: string | null
    status: string | null
    progress: number | null
    error: string | null
    created_at: string | null
    updated_at: string | null
    steps: Array<{
      id: string
      name: string
      status: string
      started_at: string | null
      finished_at: string | null
      error: string | null
      attempt?: number | null
    }>
  }
  antivirus: {
    status: string
    scanned_at: string | null
  }
  validation: {
    status: string
    notes: string | null
  }
  download_url: string | null
  preview_available: boolean
}

type RawIngestionStep = {
  id: string
  name: string
  status: string
  started_at: string | null
  finished_at: string | null
  error?: string | null
  attempt?: number | null
}

type ScriptUploadRecord = {
  id: string
  project_id: string
  file_path: string
  file_name: string | null
  file_size: number | null
  mime_type: string | null
  status: FileStatus
  category?: string
  version: number
  checksum: string | null
  antivirus_status: string
  antivirus_scanned_at: string | null
  validation_status: string
  validation_notes: string | null
  storage_bucket: string
  storage_exists: boolean
  uploaded_at: string
  updated_at: string | null
  projects?: { id: string; owner_id: string; title?: string }
}

type IngestionRecord = {
  id: string
  project_id: string
  source_file_url: string
  mime_type: string | null
  status: string | null
  progress: number | null
  error: string | null
  created_at: string | null
  updated_at: string | null
  ingestion_steps?: RawIngestionStep[]
}

const mapIngestionStatusToFileStatus = (status: string | null, fallback: FileStatus): FileStatus => {
  switch (status) {
    case 'queued':
      return 'queued'
    case 'running':
    case 'processing':
      return 'processing'
    case 'succeeded':
    case 'completed':
      return 'completed'
    case 'failed':
      return 'failed'
    default:
      return fallback
  }
}

const isPreviewableInline = (mimeType: string | null, fileName: string | null): boolean => {
  if (!mimeType && !fileName) return false
  const extension = fileName?.split('.').pop()?.toLowerCase()
  if (mimeType && ['text/plain', 'application/pdf', 'application/json'].includes(mimeType)) return true
  if (extension && ['txt', 'md', 'log', 'json', 'pdf'].includes(extension)) return true
  return false
}

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

const buildFileResponse = (
  scriptUpload: ScriptUploadRecord | null,
  ingestion: IngestionRecord | null,
  downloadUrl: string | null
): DetailedFileResponse => {
  const fallbackName = scriptUpload?.file_name || ingestion?.source_file_url?.split('/').pop() || 'File'
  const previewable = isPreviewableInline(scriptUpload?.mime_type || ingestion?.mime_type || null, fallbackName)
  const storageExists = scriptUpload?.storage_exists ?? true
  const status = mapIngestionStatusToFileStatus(ingestion?.status ?? null, scriptUpload?.status ?? 'uploaded')

  return {
    id: scriptUpload?.id || ingestion?.id,
    project_id: scriptUpload?.project_id || ingestion?.project_id,
    type: scriptUpload && ingestion ? 'both' : scriptUpload ? 'script_upload' : 'ingestion_only',
    storage_bucket: scriptUpload?.storage_bucket || 'scripts',
    storage_path: scriptUpload?.file_path || ingestion?.source_file_url,
    storage_exists: storageExists,
    file_name: fallbackName,
    mime_type: scriptUpload?.mime_type || ingestion?.mime_type || null,
    file_size: scriptUpload?.file_size ?? null,
    version: scriptUpload?.version ?? 1,
    checksum: scriptUpload?.checksum ?? null,
    status: storageExists ? status : 'missing',
    uploaded_at: scriptUpload?.uploaded_at || ingestion?.created_at,
    updated_at: scriptUpload?.updated_at || ingestion?.updated_at || null,
    ingestion: {
      id: ingestion?.id ?? null,
      status: ingestion?.status ?? null,
      progress: ingestion?.progress ?? null,
      error: ingestion?.error ?? null,
      created_at: ingestion?.created_at ?? null,
      updated_at: ingestion?.updated_at ?? null,
      steps: (ingestion?.ingestion_steps ?? []).map((step) => ({
        id: step.id,
        name: step.name,
        status: step.status,
        started_at: step.started_at,
        finished_at: step.finished_at,
        error: step.error ?? null,
        attempt: step.attempt ?? null,
      })),
    },
    antivirus: {
      status: scriptUpload?.antivirus_status ?? 'pending',
      scanned_at: scriptUpload?.antivirus_scanned_at ?? null,
    },
    validation: {
      status: scriptUpload?.validation_status ?? 'pending',
      notes: scriptUpload?.validation_notes ?? null,
    },
    download_url: downloadUrl,
    preview_available: previewable,
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; fileId: string } }
) {
  try {
    const projectId = params.id
    const fileId = params.fileId
    const supabase = await createSupabaseClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, owner_id, title')
      .eq('id', projectId)
      .single()

    if (projectError || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    if (project.owner_id !== user.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const [scriptUploadResult, ingestionResult] = await Promise.all([
      supabase
        .from('script_uploads')
        .select('*')
        .eq('id', fileId)
        .eq('project_id', projectId)
        .maybeSingle(),
      supabase
        .from('ingestions')
        .select('*')
        .eq('id', fileId)
        .eq('project_id', projectId)
        .maybeSingle(),
    ])

    const scriptUpload = scriptUploadResult.data as ScriptUploadRecord | null
    const ingestion = ingestionResult.data as IngestionRecord | null

    if (!scriptUpload && !ingestion) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }

    if (ingestion && ['running', 'queued', 'processing'].includes(ingestion.status)) {
      return NextResponse.json({ error: 'Cannot delete while processing is in progress' }, { status: 409 })
    }

    const storagePath = (scriptUpload?.file_path || ingestion?.source_file_url || '').replace(/^\/+/, '')
    if (!storagePath) {
      return NextResponse.json({ error: 'File path missing' }, { status: 400 })
    }

    const admin = getAdminClient()

    const results = {
      storage: false,
      script_upload: false,
      ingestion: false,
      ingestion_steps: false,
      packages: false,
    }

    const errors: string[] = []

    try {
      const { error: storageError } = await admin.storage
        .from(scriptUpload?.storage_bucket || 'scripts')
        .remove([storagePath])
      if (storageError) {
        errors.push(`Storage deletion failed: ${storageError.message}`)
      } else {
        results.storage = true
      }
    } catch (storageError) {
      errors.push(`Storage deletion error: ${storageError instanceof Error ? storageError.message : String(storageError)}`)
    }

    if (scriptUpload) {
      const { error: deleteUploadError } = await admin
        .from('script_uploads')
        .delete()
        .eq('id', scriptUpload.id)
      if (deleteUploadError) {
        errors.push(`Metadata deletion failed: ${deleteUploadError.message}`)
      } else {
        results.script_upload = true
      }
    }

    if (ingestion) {
      const { error: packagesError } = await admin
        .from('packages')
        .delete()
        .eq('ingestion_id', ingestion.id)
      if (packagesError) {
        errors.push(`Packages deletion failed: ${packagesError.message}`)
      } else {
        results.packages = true
      }

      const { error: stepsError } = await admin
        .from('ingestion_steps')
        .delete()
        .eq('ingestion_id', ingestion.id)
      if (stepsError) {
        errors.push(`Ingestion steps deletion failed: ${stepsError.message}`)
      } else {
        results.ingestion_steps = true
      }

      const { error: ingestionDeleteError } = await admin
        .from('ingestions')
        .delete()
        .eq('id', ingestion.id)
      if (ingestionDeleteError) {
        errors.push(`Ingestion deletion failed: ${ingestionDeleteError.message}`)
      } else {
        results.ingestion = true
      }
    }

    const success = errors.length === 0
    return NextResponse.json({
      success,
      results,
      errors: success ? undefined : errors,
      file_name: scriptUpload?.file_name || ingestion?.source_file_url?.split('/').pop() || 'File',
      file_id: fileId,
    })
  } catch (error) {
    console.error('[project-file-delete] unexpected error', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; fileId: string } }
) {
  try {
    const projectId = params.id
    const fileId = params.fileId
    const supabase = await createSupabaseClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, owner_id')
      .eq('id', projectId)
      .single()

    if (projectError || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    if (project.owner_id !== user.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const [scriptUploadResult, ingestionResult] = await Promise.all([
      supabase
        .from('script_uploads')
        .select('*')
        .eq('id', fileId)
        .eq('project_id', projectId)
        .maybeSingle(),
      supabase
        .from('ingestions')
        .select(`
          *,
          ingestion_steps (
            id,
            name,
            status,
            started_at,
            finished_at,
            attempt,
            error
          )
        `)
        .eq('id', fileId)
        .eq('project_id', projectId)
        .maybeSingle(),
    ])

    const scriptUpload = scriptUploadResult.data as ScriptUploadRecord | null
    const ingestion = ingestionResult.data as IngestionRecord | null

    if (!scriptUpload && !ingestion) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }

    let downloadUrl: string | null = null
    const storagePath = (scriptUpload?.file_path || ingestion?.source_file_url || '').replace(/^\/+/, '')

    if (storagePath) {
      const { data: signedUrlData, error: signedUrlError } = await supabase.storage
        .from(scriptUpload?.storage_bucket || 'scripts')
        .createSignedUrl(storagePath, 60 * 60, {
          download: scriptUpload?.file_name || ingestion?.source_file_url?.split('/').pop(),
        })

      if (signedUrlError) {
        console.error('[project-file-get] failed to create signed URL', signedUrlError)
      } else {
        downloadUrl = signedUrlData?.signedUrl || null
      }
    }

    const file = buildFileResponse(scriptUpload, ingestion, downloadUrl)

    return NextResponse.json({
      file,
      meta: {
        generated_at: new Date().toISOString(),
      },
    })
  } catch (error) {
    console.error('[project-file-get] unexpected error', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
