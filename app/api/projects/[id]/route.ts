import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

import type {
  ProjectOverviewResponse,
  ProjectFileSummary,
  ProjectIngestionSummary,
  ProjectTimelineEntry,
  ProjectNextAction,
  ProjectOutputsSummary,
  ProjectOverviewStats,
  ProjectIngestionStepSummary
} from '@/types/projects'
import type { Project, ScriptUpload } from '@/types/database'

export const runtime = 'nodejs'
export const maxDuration = 30

type RawIngestionStep = {
  id: string
  name: string
  status: string
  started_at: string | null
  finished_at?: string | null
  completed_at?: string | null
  attempt?: number | null
  error?: string | null
  error_message?: string | null
}

type RawIngestion = {
  id: string
  status: string
  progress: number
  created_at: string
  updated_at: string | null
  source_file_url: string
  mime_type: string | null
  error: string | null
  ingestion_steps?: RawIngestionStep[]
}

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

const SUCCESS_STATUSES = new Set(['succeeded', 'completed'])
const ACTIVE_STATUSES = new Set(['running', 'processing', 'queued'])

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
            // read-only in server context
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
      .select('*')
      .eq('id', id)
      .single<Project>()

    if (projectError || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    if (project.owner_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const [scriptUploadsResult, ingestionsResult, assetsResult, contentResult] = await Promise.all([
      supabase
        .from('script_uploads')
        .select(
          `
            id,
            file_name,
            file_size,
            file_path,
            version,
            status,
            category,
            uploaded_at,
            storage_exists,
            last_verified_at
          `
        )
        .eq('project_id', id)
        .order('uploaded_at', { ascending: false }),

      supabase
        .from('ingestions')
        .select(
          `
            id,
            status,
            progress,
            created_at,
            updated_at,
            source_file_url,
            mime_type,
            error,
            ingestion_steps (
              id,
              name,
              status,
              started_at,
              finished_at,
              completed_at,
              attempt,
              error,
              error_message
            )
          `
        )
        .eq('project_id', id)
        .order('created_at', { ascending: true }),

      supabase
        .from('generated_assets')
        .select('*')
        .eq('project_id', id)
        .order('created_at', { ascending: false }),

      supabase
        .from('generated_content')
        .select('*')
        .eq('project_id', id)
        .order('created_at', { ascending: false })
    ])

    if (scriptUploadsResult.error) {
      console.error('[project-overview] failed to load script_uploads', scriptUploadsResult.error)
      return NextResponse.json({ error: 'Unable to load project files' }, { status: 500 })
    }

    if (ingestionsResult.error) {
      console.error('[project-overview] failed to load ingestions', ingestionsResult.error)
      return NextResponse.json({ error: 'Unable to load processing data' }, { status: 500 })
    }

    if (assetsResult.error || contentResult.error) {
      console.error('[project-overview] failed to load generated outputs', {
        assets: assetsResult.error,
        content: contentResult.error,
      })
      return NextResponse.json({ error: 'Unable to load generated outputs' }, { status: 500 })
    }

    const scriptUploads = (scriptUploadsResult.data || []) as unknown as ScriptUpload[]
    const ingestionsRaw = (ingestionsResult.data || []) as RawIngestion[]
    const assets = (assetsResult.data || []) as RawGeneratedAsset[]
    const generatedContent = (contentResult.data || []) as RawGeneratedContent[]
    let packages: RawPackage[] = []
    if (ingestionsRaw.length > 0) {
      const ingestionIds = ingestionsRaw.map((ingestion) => ingestion.id)
      const packagesQuery = await supabase
        .from('packages')
        .select('*')
        .in('ingestion_id', ingestionIds)
        .order('created_at', { ascending: false })

      if (packagesQuery.error) {
        console.error('[project-overview] failed to load packages', packagesQuery.error)
        return NextResponse.json({ error: 'Unable to load generated packages' }, { status: 500 })
      }

      packages = (packagesQuery.data || []) as RawPackage[]
    }

    const ingestionMapByPath = new Map<string, RawIngestion>()
    ingestionsRaw.forEach((ingestion) => {
      if (!ingestion.source_file_url) return
      ingestionMapByPath.set(ingestion.source_file_url, ingestion)
    })

    const files: ProjectFileSummary[] = scriptUploads.slice(0, 20).map((upload) => {
      const ingestion = ingestionMapByPath.get(upload.file_path)
      return {
        id: upload.id,
        file_name: upload.file_name || upload.file_path.split('/').pop() || 'File',
        version: (upload as any).version,
        status: (upload as any).status,
        category: (upload as any).category,
        uploaded_at: upload.uploaded_at,
        file_size: upload.file_size,
        ingestion_id: ingestion?.id ?? null,
        ingestion_status: ingestion?.status ?? null,
        ingestion_progress: ingestion?.progress ?? null,
        storage_exists: (upload as any).storage_exists,
        last_verified_at: (upload as any).last_verified_at ?? null,
      }
    })

    const ingestions: ProjectIngestionSummary[] = ingestionsRaw.map((ingestion) => {
      const steps: ProjectIngestionStepSummary[] = (ingestion.ingestion_steps || []).map((step) => ({
        id: step.id,
        name: step.name,
        status: step.status,
        started_at: step.started_at,
        finished_at: step.finished_at ?? step.completed_at ?? null,
        attempt: step.attempt ?? null,
        error: step.error || step.error_message || null,
      }))

      return {
        id: ingestion.id,
        status: ingestion.status,
        progress: ingestion.progress,
        created_at: ingestion.created_at,
        updated_at: ingestion.updated_at,
        source_file_url: ingestion.source_file_url,
        mime_type: ingestion.mime_type,
        error: ingestion.error,
        steps,
      }
    })

    const stats: ProjectOverviewStats = {
      total_files: scriptUploads.length,
      active_ingestions: ingestionsRaw.filter((ing) => ACTIVE_STATUSES.has(ing.status)).length,
      completed_ingestions: ingestionsRaw.filter((ing) => SUCCESS_STATUSES.has(ing.status)).length,
      failed_ingestions: ingestionsRaw.filter((ing) => ing.status === 'failed').length,
      latest_upload_at: scriptUploads.length > 0 ? scriptUploads[0].uploaded_at : null,
      last_processed_at: (() => {
        const completed = ingestionsRaw
          .filter((ing) => SUCCESS_STATUSES.has(ing.status) && ing.updated_at)
          .map((ing) => ing.updated_at as string)
        if (completed.length === 0) return null
        return completed.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]
      })(),
    }

    const outputs: ProjectOutputsSummary = (() => {
      const counts = {
        total_assets: assets.length,
        documents: 0,
        decks: 0,
        images: 0,
        content_items: generatedContent.length,
        packages: packages.length,
        last_generated_at: null as string | null,
      }

      const lastAsset = assets.length > 0
        ? assets.map((asset) => asset.created_at).sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]
        : null
      const lastContent = generatedContent.length > 0
        ? generatedContent.map((item) => item.created_at).sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]
        : null
      const lastPackage = packages.length > 0
        ? packages.map((pkg) => pkg.created_at).sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]
        : null

      counts.last_generated_at = [lastAsset, lastContent, lastPackage]
        .filter(Boolean)
        .sort((a, b) => new Date(b as string).getTime() - new Date(a as string).getTime())[0] || null

      assets.forEach((asset) => {
        const type = asset.asset_type?.toLowerCase() || ''
        if (type.includes('deck')) {
          counts.decks += 1
        } else if (type.includes('image') || type.includes('visual')) {
          counts.images += 1
        } else {
          counts.documents += 1
        }
      })

      return counts
    })()

    const timeline: ProjectTimelineEntry[] = buildTimeline({
      project,
      files,
      ingestions,
      outputs,
    })

    const nextActions = deriveNextActions({
      project,
      stats,
      outputs,
      timeline,
    })

    const response: ProjectOverviewResponse = {
      project,
      files,
      ingestions,
      stats,
      outputs,
      timeline,
      next_actions: nextActions,
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('[project-overview] unexpected error', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const payload = await request.json()
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
            // read-only in server context
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

    const allowedFields = ['title', 'description', 'status', 'logline', 'synopsis', 'genre'] as const
    const updates: Partial<Record<typeof allowedFields[number], unknown>> = {}

    allowedFields.forEach((field) => {
      if (field in payload) {
        updates[field] = payload[field]
      }
    })

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields provided' }, { status: 400 })
    }

    const { data: updatedProject, error: updateError } = await supabase
      .from('projects')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single<Project>()

    if (updateError || !updatedProject) {
      console.error('[project-update] failed', updateError)
      return NextResponse.json({ error: 'Failed to update project' }, { status: 500 })
    }

    return NextResponse.json(updatedProject)
  } catch (error) {
    console.error('[project-update] unexpected error', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function buildTimeline({
  project,
  files,
  ingestions,
  outputs,
}: {
  project: Project
  files: ProjectFileSummary[]
  ingestions: ProjectIngestionSummary[]
  outputs: ProjectOutputsSummary
}): ProjectTimelineEntry[] {
  const latestFile = files.length > 0
    ? files.map((file) => file.uploaded_at).sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]
    : null

  const activeIngestion = ingestions.find((ing) => ACTIVE_STATUSES.has(ing.status))
  const completedIngestion = ingestions
    .filter((ing) => SUCCESS_STATUSES.has(ing.status) && ing.updated_at)
    .sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime())[0]

  const reviewReady = outputs.total_assets > 0 || outputs.content_items > 0 || outputs.packages > 0

  const timeline: ProjectTimelineEntry[] = [
    {
      key: 'project_created',
      label: 'Project created',
      description: 'Initial project setup complete',
      status: 'completed',
      timestamp: project.created_at,
    },
    {
      key: 'files_uploaded',
      label: 'Files uploaded',
      description: files.length > 0 ? `${files.length} files uploaded` : 'Upload scripts or documents to get started',
      status: files.length > 0 ? 'completed' : 'pending',
      timestamp: latestFile,
    },
    {
      key: 'processing',
      label: 'AI processing',
      description: activeIngestion
        ? `Processing ${Math.max(activeIngestion.progress, 0)}%`
        : completedIngestion
        ? 'Latest processing run completed'
        : 'Processing will begin once files are uploaded',
      status: activeIngestion ? 'current' : completedIngestion ? 'completed' : 'pending',
      timestamp: activeIngestion?.updated_at || completedIngestion?.updated_at || null,
      meta: activeIngestion
        ? { ingestion_id: activeIngestion.id }
        : completedIngestion
        ? { ingestion_id: completedIngestion.id }
        : undefined,
    },
    {
      key: 'review',
      label: 'Review & approve',
      description: reviewReady ? 'AI outputs ready for review' : 'Review will unlock once processing completes',
      status: reviewReady ? (project.status === 'approved' ? 'completed' : 'current') : 'pending',
      timestamp: outputs.last_generated_at,
    },
  ]

  return timeline
}

function deriveNextActions({
  project,
  stats,
  outputs,
  timeline,
}: {
  project: Project
  stats: ProjectOverviewStats
  outputs: ProjectOutputsSummary
  timeline: ProjectTimelineEntry[]
}): ProjectNextAction[] {
  const actions: ProjectNextAction[] = []

  const hasUploads = stats.total_files > 0
  const reviewReady = outputs.total_assets > 0 || outputs.content_items > 0 || outputs.packages > 0

  if (!hasUploads) {
    actions.push({
      key: 'upload-files',
      title: 'Upload script or supporting files',
      description: 'Kick off the AI workflow by uploading a script or project materials.',
      href: { pathname: '/projects/[id]/upload', query: { id: project.id } },
      ctaLabel: 'Upload files',
    })
  }

  const processingEntry = timeline.find((entry) => entry.key === 'processing')
  if (processingEntry && processingEntry.status === 'current') {
    actions.push({
      key: 'monitor-processing',
      title: 'Processing in progress',
      description: 'Monitor real-time progress and review logs while the AI prepares deliverables.',
      href: { pathname: '/projects/[id]/review', query: { id: project.id } },
      ctaLabel: 'Open processing dashboard',
    })
  }

  if (reviewReady && project.status !== 'approved') {
    actions.push({
      key: 'review-outputs',
      title: 'Review AI-generated outputs',
      description: 'Preview, rate, and approve the generated pitch materials.',
      href: { pathname: '/projects/[id]/review', query: { id: project.id } },
      ctaLabel: 'Review outputs',
    })
  }

  if (project.status === 'approved') {
    actions.push({
      key: 'export-assets',
      title: 'Export and share deliverables',
      description: 'Download pitch decks, summaries, and shareables for your stakeholders.',
      href: { pathname: '/projects/[id]/review', query: { id: project.id } },
      ctaLabel: 'Open deliverables',
    })
  }

  return actions
}
