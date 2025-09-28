import type { SupabaseClient } from '@supabase/supabase-js'

import type {
  ProjectReviewData,
  ReviewFeedbackEntry,
  ReviewGeneratedAsset,
  ReviewGeneratedContent,
  ReviewPackage,
  ReviewProcessingStep,
  ReviewProject,
  ReviewRevisionRequest,
} from '@/types/review'
import type { ProjectIngestionSummary } from '@/types/projects'

type RawIngestionStepRow = {
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

type RawIngestionRow = {
  id: string
  status: string
  progress: number
  created_at: string
  updated_at: string | null
  source_file_url: string
  mime_type: string | null
  error: string | null
  ingestion_steps?: RawIngestionStepRow[]
}

type RawProcessingStepRow = {
  id: string
  project_id: string
  step: string
  status: string
  started_at: string | null
  finished_at?: string | null
  completed_at?: string | null
  error_message?: string | null
  retry_count?: number | null
  created_at: string
  metadata?: Record<string, unknown> | null
}

type RawGeneratedAssetRow = {
  id: string
  project_id: string
  ingestion_id?: string | null
  asset_type?: string | null
  kind?: string | null
  file_path?: string | null
  asset_url?: string | null
  file_name?: string | null
  bytes?: number | null
  size?: number | null
  sha256?: string | null
  status?: string | null
  metadata?: Record<string, unknown> | null
  created_at: string
}

type RawGeneratedContentRow = {
  id: string
  project_id: string
  step: string
  payload: unknown
  created_at: string
}

type RawPackageRow = {
  id: string
  ingestion_id: string
  summary: unknown
  deck_url: string | null
  document_url: string | null
  artifacts: unknown
  created_at: string
}

export async function loadProjectReviewData(
  supabase: SupabaseClient,
  projectId: string,
  ownerId?: string
): Promise<ProjectReviewData | null> {
  const { data: projectRow, error: projectError } = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .single()

  if (projectError || !projectRow) {
    return null
  }

  if (ownerId && projectRow.owner_id !== ownerId) {
    return null
  }

  const { data: ingestions } = await supabase
    .from('ingestions')
    .select(`
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
    `)
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })

  const { data: processing_steps } = await supabase
    .from('ai_processing_status')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })

  const { data: generated_assets } = await supabase
    .from('generated_assets')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })

  const { data: generated_content } = await supabase
    .from('generated_content')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })

  const ingestionsRaw = (ingestions || []) as RawIngestionRow[]
  const processingRaw = (processing_steps || []) as RawProcessingStepRow[]
  const assetsRaw = (generated_assets || []) as RawGeneratedAssetRow[]
  const contentRaw = (generated_content || []) as RawGeneratedContentRow[]

  let packages: ReviewPackage[] = []
  if (ingestionsRaw.length > 0) {
    const ingestionIds = ingestionsRaw.map((ing) => ing.id)
    const packagesQuery = await supabase
      .from('packages')
      .select('*')
      .in('ingestion_id', ingestionIds)
      .order('created_at', { ascending: false })

    packages = ((packagesQuery.data || []) as RawPackageRow[]).map((pkg) => ({
      id: pkg.id,
      ingestion_id: pkg.ingestion_id,
      summary: typeof pkg.summary === 'object' ? (pkg.summary as Record<string, unknown>) : null,
      deck_url: pkg.deck_url,
      document_url: pkg.document_url,
      artifacts: typeof pkg.artifacts === 'object' ? (pkg.artifacts as Record<string, unknown>) : null,
      created_at: pkg.created_at,
    }))
  }

  const normalizedProject: ReviewProject = {
    id: projectRow.id,
    title: projectRow.title,
    description: projectRow.description || projectRow.synopsis || null,
    status: projectRow.status,
    logline: projectRow.logline || null,
    synopsis: projectRow.synopsis || null,
    genre: Array.isArray(projectRow.genre)
      ? (projectRow.genre as string[])
      : typeof projectRow.genre === 'string' && projectRow.genre.length > 0
        ? projectRow.genre.split(',').map((item: string) => item.trim())
        : null,
    created_at: projectRow.created_at,
    updated_at: (projectRow as { updated_at?: string }).updated_at || projectRow.created_at,
    owner_id: projectRow.owner_id,
    processing_status: (projectRow as { processing_status?: string | null }).processing_status ?? null,
    quality_score: (projectRow as { quality_score?: number | null }).quality_score ?? null,
    last_run_at: (projectRow as { last_run_at?: string | null }).last_run_at ?? null,
  }

  const ingestionSummaries: ProjectIngestionSummary[] = ingestionsRaw.map((ing) => ({
    id: ing.id,
    status: ing.status,
    progress: ing.progress,
    created_at: ing.created_at,
    updated_at: ing.updated_at,
    source_file_url: ing.source_file_url,
    mime_type: ing.mime_type,
    error: ing.error,
    steps: (ing.ingestion_steps || []).map((step) => ({
      id: step.id,
      name: step.name,
      status: step.status,
      started_at: step.started_at,
      finished_at: step.finished_at || step.completed_at || null,
      attempt: step.attempt ?? null,
      error: step.error || step.error_message || null,
    })),
  }))

  const processingSteps: ReviewProcessingStep[] = processingRaw.map((step) => ({
    id: step.id,
    project_id: step.project_id,
    step: step.step,
    status: step.status,
    started_at: step.started_at,
    finished_at: step.finished_at || step.completed_at || null,
    error: typeof step.error_message === 'string'
      ? step.error_message
      : step.error_message?.message ?? null,
    retry_count: step.retry_count ?? 0,
    created_at: step.created_at,
    metadata: step.metadata ?? null,
  }))

  const assetSummaries: ReviewGeneratedAsset[] = assetsRaw.map((asset) => ({
    id: asset.id,
    project_id: asset.project_id,
    ingestion_id: asset.ingestion_id ?? null,
    kind: asset.asset_type || asset.kind || 'asset',
    storage_path: asset.file_path || asset.asset_url || '',
    file_name: asset.file_name || null,
    bytes: asset.bytes ?? asset.size ?? null,
    sha256: asset.sha256 || null,
    status: asset.status || null,
    metadata: asset.metadata ?? null,
    created_at: asset.created_at,
  }))

  const contentSummaries: ReviewGeneratedContent[] = contentRaw.map((item) => ({
    id: item.id,
    project_id: item.project_id,
    step: item.step,
    payload: typeof item.payload === 'object' && item.payload !== null
      ? (item.payload as Record<string, unknown>)
      : null,
    created_at: item.created_at,
  }))

  const approval_status = {
    approved: false,
    approved_at: null,
    approved_by: null,
    feedback: [] as ReviewFeedbackEntry[],
    revision_requests: [] as ReviewRevisionRequest[],
  }

  return {
    project: normalizedProject,
    ingestions: ingestionSummaries,
    processing_steps: processingSteps,
    generated_assets: assetSummaries,
    generated_content: contentSummaries,
    packages,
    approval_status,
  }
}
