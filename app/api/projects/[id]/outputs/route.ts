import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

import type { ProjectOutputsResponse } from '@/types/projects'
import type { Project } from '@/types/database'

export const runtime = 'nodejs'
export const maxDuration = 30

type RawGeneratedAsset = {
  id: string
  project_id: string
  ingestion_id: string | null
  asset_type: string
  asset_url: string | null
  file_path?: string | null
  file_name?: string | null
  status?: string | null
  metadata?: Record<string, unknown> | null
  bytes?: number | null
  created_at: string
}

type RawGeneratedContent = {
  id: string
  project_id: string
  step: string
  payload: Record<string, unknown> | null
  created_at: string
}

type RawPackage = {
  id: string
  ingestion_id: string
  summary: string | null
  deck_url: string | null
  document_url: string | null
  artifacts: Record<string, unknown> | null
  created_at: string
}

type RawIngestion = {
  id: string
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const cookieStore = await cookies()

    const supabase = createServerClient(
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
      .eq('id', id)
      .single<Project>()

    if (projectError || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    if (project.owner_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const [assetsResult, contentResult, ingestionsResult] = await Promise.all([
      supabase
        .from('generated_assets')
        .select('*')
        .eq('project_id', id)
        .order('created_at', { ascending: false }),

      supabase
        .from('generated_content')
        .select('*')
        .eq('project_id', id)
        .order('created_at', { ascending: false }),

      supabase
        .from('ingestions')
        .select('id')
        .eq('project_id', id)
    ])

    if (assetsResult.error || contentResult.error || ingestionsResult.error) {
      console.error('[project-outputs] failed to load base data', {
        assets: assetsResult.error,
        content: contentResult.error,
        ingestions: ingestionsResult.error,
      })
      return NextResponse.json({ error: 'Unable to load project outputs' }, { status: 500 })
    }

    const assets = (assetsResult.data || []) as RawGeneratedAsset[]
    const generatedContent = (contentResult.data || []) as RawGeneratedContent[]
    const ingestions = (ingestionsResult.data || []) as RawIngestion[]

    let packages: RawPackage[] = []
    if (ingestions.length > 0) {
      const ingestionIds = ingestions.map((ing) => ing.id)
      const packagesQuery = await supabase
        .from('packages')
        .select('*')
        .in('ingestion_id', ingestionIds)
        .order('created_at', { ascending: false })

      if (packagesQuery.error) {
        console.error('[project-outputs] failed to load packages', packagesQuery.error)
        return NextResponse.json({ error: 'Unable to load generated packages' }, { status: 500 })
      }

      packages = (packagesQuery.data || []) as RawPackage[]
    }

    const response: ProjectOutputsResponse = {
      assets: assets.map((asset) => ({
        id: asset.id,
        kind: asset.asset_type,
        storage_path: asset.file_path || asset.asset_url || '',
        bytes: asset.bytes ?? null,
        created_at: asset.created_at,
        metadata: asset.metadata ?? null,
      })),
      content: generatedContent.map((item) => ({
        id: item.id,
        step: item.step,
        created_at: item.created_at,
        payload: item.payload ?? null,
      })),
      packages: packages.map((pkg) => ({
        id: pkg.id,
        ingestion_id: pkg.ingestion_id,
        summary: pkg.summary,
        deck_url: pkg.deck_url,
        document_url: pkg.document_url,
        artifacts: pkg.artifacts ?? null,
        created_at: pkg.created_at,
      })),
      last_generated_at: computeLastGeneratedAt({ assets, content: generatedContent, packages }),
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('[project-outputs] unexpected error', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function computeLastGeneratedAt({
  assets,
  content,
  packages,
}: {
  assets: RawGeneratedAsset[]
  content: RawGeneratedContent[]
  packages: RawPackage[]
}): string | null {
  const timestamps: string[] = []
  if (assets.length > 0) {
    timestamps.push(...assets.map((asset) => asset.created_at))
  }
  if (content.length > 0) {
    timestamps.push(...content.map((item) => item.created_at))
  }
  if (packages.length > 0) {
    timestamps.push(...packages.map((item) => item.created_at))
  }

  if (timestamps.length === 0) return null

  return timestamps.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]
}
