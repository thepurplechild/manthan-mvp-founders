import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const maxDuration = 30

type FileStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'uploaded' | 'missing'
type FileCategory = 'script' | 'document' | 'image' | 'other'
type AntivirusStatus = 'pending' | 'scanning' | 'clean' | 'flagged' | 'failed'
type ValidationStatus = 'pending' | 'passed' | 'failed'

const FILE_STATUS_ORDER: Record<FileStatus, number> = {
  queued: 0,
  processing: 1,
  uploaded: 2,
  completed: 3,
  failed: 4,
  missing: 5,
}

type IngestionStep = {
  id: string
  name: string
  status: string
  started_at: string | null
  finished_at: string | null
  error: string | null
  attempt?: number | null
  processing_duration_ms?: number | null
}

type ProjectFileRecord = {
  id: string
  type: 'script_upload' | 'ingestion_only' | 'both'
  project_id: string
  script_upload_id: string | null
  ingestion_id: string | null
  storage_bucket: string
  storage_path: string
  storage_exists: boolean | null
  storage_checked_at: string | null
  file_name: string
  file_extension: string | null
  file_size: number | null
  mime_type: string | null
  category: FileCategory
  version: number
  checksum: string | null
  uploaded_at: string
  updated_at: string | null
  status: FileStatus
  status_source: 'script_upload' | 'ingestion' | 'storage'
  ingestion_status: string | null
  ingestion_progress: number | null
  ingestion_error: string | null
  antivirus_status: AntivirusStatus
  antivirus_scanned_at: string | null
  validation_status: ValidationStatus
  validation_notes: string | null
  preview_available: boolean
  download_available: boolean
  steps: IngestionStep[]
  metrics: {
    estimated_completion_at: string | null
    last_activity_at: string | null
  }
}

type StorageCheckResult = {
  exists: boolean
  checkedAt: string
}

type RawIngestionStep = {
  id: string
  name: string
  status: string
  started_at: string | null
  finished_at: string | null
  error?: string | null
  attempt?: number | null
  processing_duration_ms?: number | null
}

type ScriptUploadRecord = {
  id: string
  project_id: string
  file_path: string
  file_name: string | null
  file_size: number | null
  uploaded_at: string
  mime_type: string | null
  status: FileStatus
  category: FileCategory
  version: number
  checksum: string | null
  antivirus_status: AntivirusStatus
  antivirus_scanned_at: string | null
  validation_status: ValidationStatus
  validation_notes: string | null
  storage_bucket: string
  storage_exists: boolean
  last_verified_at: string | null
  updated_at: string | null
}

type IngestionRecord = {
  id: string
  project_id: string
  source_file_url: string
  mime_type: string | null
  status: string | null
  progress: number | null
  error: string | null
  created_at: string
  updated_at: string | null
  ingestion_steps?: RawIngestionStep[]
}

const deriveFileExtension = (fileName: string | null): string | null => {
  if (!fileName || !fileName.includes('.')) return null
  return fileName.split('.').pop()?.toLowerCase() ?? null
}

const deriveCategory = (mimeType: string | null, extension: string | null): FileCategory => {
  if (mimeType?.startsWith('image/')) return 'image'
  if (mimeType === 'application/pdf') return 'document'
  if (mimeType === 'text/plain' || mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || mimeType === 'application/msword') {
    return 'script'
  }
  if (extension) {
    if (['pdf'].includes(extension)) return 'document'
    if (['txt', 'doc', 'docx', 'rtf', 'md', 'fountain'].includes(extension)) return 'script'
    if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(extension)) return 'image'
  }
  return 'other'
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

const isPreviewableInline = (mimeType: string | null, extension: string | null): boolean => {
  if (!mimeType && !extension) return false
  const inlineMimeTypes = new Set([
    'text/plain',
    'application/pdf',
    'application/json'
  ])
  if (mimeType && inlineMimeTypes.has(mimeType)) return true
  if (extension) {
    if (['txt', 'md', 'log', 'json', 'pdf'].includes(extension)) return true
  }
  return false
}

const computeEstimatedCompletion = (status: FileStatus, steps: IngestionStep[], createdAt: string | null): string | null => {
  if (status !== 'processing' && status !== 'queued') return null
  if (!createdAt) return null
  const inProgressSteps = steps.filter((step) => step.status === 'running')
  if (inProgressSteps.length === 0) return null
  const firstStep = inProgressSteps[0]
  if (!firstStep.started_at) return null
  // Rough heuristic: assume remaining steps ~2 minutes each
  const remainingSteps = steps.filter((step) => step.status !== 'completed' && step.status !== 'succeeded').length
  const estimatedMs = remainingSteps * 2 * 60 * 1000
  return new Date(Date.now() + estimatedMs).toISOString()
}

const toDisplayStatus = (primary: FileStatus, storageExists: boolean | null): FileStatus => {
  if (storageExists === false) return 'missing'
  return primary
}

const sanitizeStoragePath = (path: string): string => path.replace(/^\/+/, '')

const buildFolderKey = (path: string): { folder: string; fileName: string } => {
  const cleaned = sanitizeStoragePath(path)
  const segments = cleaned.split('/')
  const fileName = segments.pop() ?? cleaned
  const folder = segments.join('/')
  return { folder, fileName }
}

async function verifyStorageState(
  files: ProjectFileRecord[],
  bucket: string
): Promise<Map<string, StorageCheckResult>> {
  const admin = getAdminClient()
  const folderMap = new Map<string, Set<string>>()

  files.forEach((file) => {
    if (!file.storage_path) return
    const { folder, fileName } = buildFolderKey(file.storage_path)
    if (!folderMap.has(folder)) {
      folderMap.set(folder, new Set())
    }
    folderMap.get(folder)!.add(fileName)
  })

  const checks = new Map<string, StorageCheckResult>()
  const nowIso = new Date().toISOString()

  for (const [folder, namesSet] of folderMap.entries()) {
    try {
      const { data, error } = await admin.storage
        .from(bucket)
        .list(folder === '' ? undefined : folder, {
          limit: 1000,
        })

      if (error) {
        console.warn('[project-files] storage list failed', { folder, error })
        namesSet.forEach((name) => {
          checks.set(`${folder}/${name}`.replace(/^\//, ''), {
            exists: false,
            checkedAt: nowIso,
          })
        })
        continue
      }

      const existingNames = new Set((data || []).map((item) => item.name))
      namesSet.forEach((name) => {
        const key = `${folder}/${name}`.replace(/^\//, '')
        checks.set(key, {
          exists: existingNames.has(name),
          checkedAt: nowIso,
        })
      })
    } catch (storageError) {
      console.error('[project-files] storage verification error', storageError)
      namesSet.forEach((name) => {
        checks.set(`${folder}/${name}`.replace(/^\//, ''), {
          exists: false,
          checkedAt: nowIso,
        })
      })
    }
  }

  return checks
}

const deriveLastActivity = (
  uploadedAt: string,
  updatedAt: string | null,
  ingestionUpdatedAt: string | null
): string => {
  const timestamps = [uploadedAt, updatedAt, ingestionUpdatedAt].filter(Boolean) as string[]
  return timestamps.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const projectId = params.id
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
            // no-op on server
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
      .select('id, owner_id, title, created_at')
      .eq('id', projectId)
      .single()

    if (projectError || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    if (project.owner_id !== user.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const [scriptUploadsResult, ingestionsResult] = await Promise.all([
      supabase
        .from('script_uploads')
        .select(`
          id,
          project_id,
          file_path,
          file_name,
          file_size,
          uploaded_at,
          mime_type,
          status,
          category,
          version,
          checksum,
          antivirus_status,
          antivirus_scanned_at,
          validation_status,
          validation_notes,
          storage_bucket,
          storage_exists,
          last_verified_at,
          updated_at
        `)
        .eq('project_id', projectId)
        .order('uploaded_at', { ascending: false }),
      supabase
        .from('ingestions')
        .select(`
          id,
          project_id,
          source_file_url,
          mime_type,
          status,
          progress,
          error,
          created_at,
          updated_at,
          ingestion_steps (
            id,
            name,
            status,
            started_at,
            finished_at,
            attempt,
            processing_duration_ms,
            error
          )
        `)
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
    ])

    if (scriptUploadsResult.error) {
      console.error('[project-files] Failed to load script_uploads', scriptUploadsResult.error)
      return NextResponse.json({ error: 'Unable to load files' }, { status: 500 })
    }

    if (ingestionsResult.error) {
      console.error('[project-files] Failed to load ingestions', ingestionsResult.error)
      return NextResponse.json({ error: 'Unable to load ingestion data' }, { status: 500 })
    }

    const scriptUploads = (scriptUploadsResult.data || []) as ScriptUploadRecord[]
    const ingestions = (ingestionsResult.data || []) as IngestionRecord[]

    const ingestionMapByPath = new Map<string, IngestionRecord>()
    ingestions.forEach((ingestion) => {
      const key = ingestion.source_file_url
      if (!key) return
      if (!ingestionMapByPath.has(key)) {
        ingestionMapByPath.set(key, ingestion)
        return
      }
      const existing = ingestionMapByPath.get(key)
      if (new Date(ingestion.created_at).getTime() > new Date(existing.created_at).getTime()) {
        ingestionMapByPath.set(key, ingestion)
      }
    })

    const files: ProjectFileRecord[] = []

    scriptUploads.forEach((upload) => {
      const ingestion = ingestionMapByPath.get(upload.file_path) || null
      const extension = deriveFileExtension(upload.file_name)
      const statusFromIngestion = ingestion ? mapIngestionStatusToFileStatus(ingestion.status, upload.status) : upload.status
      const status = toDisplayStatus(statusFromIngestion, upload.storage_exists)

      const ingestionSteps = (ingestion?.ingestion_steps ?? []) as RawIngestionStep[]
      const normalizedSteps: IngestionStep[] = ingestionSteps.map((step) => ({
        id: step.id,
        name: step.name,
        status: step.status,
        started_at: step.started_at,
        finished_at: step.finished_at,
        error: step.error ?? null,
        attempt: step.attempt ?? null,
        processing_duration_ms: step.processing_duration_ms ?? null,
      }))

      files.push({
        id: upload.id,
        type: ingestion ? 'both' : 'script_upload',
        project_id: upload.project_id,
        script_upload_id: upload.id,
        ingestion_id: ingestion?.id ?? null,
        storage_bucket: upload.storage_bucket || 'scripts',
        storage_path: sanitizeStoragePath(upload.file_path),
        storage_exists: upload.storage_exists,
        storage_checked_at: upload.last_verified_at,
        file_name: upload.file_name || upload.file_path.split('/').pop() || 'File',
        file_extension: extension,
        file_size: upload.file_size,
        mime_type: upload.mime_type || ingestion?.mime_type || null,
        category: upload.category || deriveCategory(upload.mime_type || ingestion?.mime_type || null, extension),
        version: upload.version || 1,
        checksum: upload.checksum || null,
        uploaded_at: upload.uploaded_at,
        updated_at: upload.updated_at,
        status,
        status_source: ingestion ? 'ingestion' : 'script_upload',
        ingestion_status: ingestion?.status ?? null,
        ingestion_progress: ingestion?.progress ?? null,
        ingestion_error: ingestion?.error ?? null,
        antivirus_status: upload.antivirus_status,
        antivirus_scanned_at: upload.antivirus_scanned_at,
        validation_status: upload.validation_status,
        validation_notes: upload.validation_notes,
        preview_available: isPreviewableInline(upload.mime_type || ingestion?.mime_type || null, extension),
        download_available: upload.storage_exists !== false,
        steps: normalizedSteps,
        metrics: {
          estimated_completion_at: computeEstimatedCompletion(status, normalizedSteps, ingestion?.created_at || upload.uploaded_at),
          last_activity_at: deriveLastActivity(upload.uploaded_at, upload.updated_at, ingestion?.updated_at || null),
        },
      })
    })

    // Include ingestions without matching script upload (edge cases / legacy data)
    ingestions.forEach((ingestion) => {
      if (files.some((file) => file.ingestion_id === ingestion.id)) {
        return
      }

      const extension = deriveFileExtension(ingestion.source_file_url?.split('/').pop() || null)
      const status = toDisplayStatus(mapIngestionStatusToFileStatus(ingestion.status, 'uploaded'), true)
      const ingestionSteps = (ingestion.ingestion_steps ?? []) as RawIngestionStep[]
      const normalizedSteps: IngestionStep[] = ingestionSteps.map((step) => ({
        id: step.id,
        name: step.name,
        status: step.status,
        started_at: step.started_at,
        finished_at: step.finished_at,
        error: step.error ?? null,
        attempt: step.attempt ?? null,
        processing_duration_ms: step.processing_duration_ms ?? null,
      }))

      files.push({
        id: ingestion.id,
        type: 'ingestion_only',
        project_id: ingestion.project_id,
        script_upload_id: null,
        ingestion_id: ingestion.id,
        storage_bucket: 'scripts',
        storage_path: sanitizeStoragePath(ingestion.source_file_url || ''),
        storage_exists: true,
        storage_checked_at: null,
        file_name: ingestion.source_file_url?.split('/').pop() || 'File',
        file_extension: extension,
        file_size: null,
        mime_type: ingestion.mime_type || null,
        category: deriveCategory(ingestion.mime_type || null, extension),
        version: 1,
        checksum: null,
        uploaded_at: ingestion.created_at,
        updated_at: ingestion.updated_at,
        status,
        status_source: 'ingestion',
        ingestion_status: ingestion.status ?? null,
        ingestion_progress: ingestion.progress ?? null,
        ingestion_error: ingestion.error ?? null,
        antivirus_status: 'pending',
        antivirus_scanned_at: null,
        validation_status: 'pending',
        validation_notes: null,
        preview_available: isPreviewableInline(ingestion.mime_type || null, extension),
        download_available: true,
        steps: normalizedSteps,
        metrics: {
          estimated_completion_at: computeEstimatedCompletion(status, normalizedSteps, ingestion.created_at),
          last_activity_at: deriveLastActivity(ingestion.created_at, ingestion.updated_at, ingestion.updated_at),
        },
      })
    })

    // Verify storage integrity and persist metadata changes when necessary
    const filesWithPaths = files.filter((file) => file.storage_path)
    const storageChecks = filesWithPaths.length > 0
      ? await verifyStorageState(filesWithPaths, 'scripts')
      : new Map<string, StorageCheckResult>()

    const storageUpdates: { id: string; storage_exists: boolean; last_verified_at: string }[] = []
    const knownStorageIssues: { file_id: string; storage_path: string }[] = []

    files.forEach((file) => {
      if (!file.storage_path) return
      const checkKey = file.storage_path
      if (!storageChecks.has(checkKey)) return
      const result = storageChecks.get(checkKey)!
      file.storage_exists = result.exists
      file.storage_checked_at = result.checkedAt
      file.status = toDisplayStatus(file.status, result.exists)
      if (file.script_upload_id && file.storage_exists !== undefined) {
        if (file.storage_exists !== true) {
          knownStorageIssues.push({ file_id: file.id, storage_path: file.storage_path })
        }
        if (file.script_upload_id) {
          const originalUpload = scriptUploads.find((su) => su.id === file.script_upload_id)
          if (!originalUpload || originalUpload.storage_exists !== result.exists) {
            storageUpdates.push({
              id: file.script_upload_id,
              storage_exists: result.exists,
              last_verified_at: result.checkedAt,
            })
          }
        }
      }
    })

    if (storageUpdates.length > 0) {
      try {
        const admin = getAdminClient()
        await admin
          .from('script_uploads')
          .upsert(storageUpdates, { onConflict: 'id' })
      } catch (storagePersistError) {
        console.error('[project-files] Failed to persist storage metadata', storagePersistError)
      }
    }

    files.sort((a, b) => {
      const statusDiff = FILE_STATUS_ORDER[a.status] - FILE_STATUS_ORDER[b.status]
      if (statusDiff !== 0) return statusDiff
      return new Date(b.metrics.last_activity_at || b.uploaded_at).getTime() - new Date(a.metrics.last_activity_at || a.uploaded_at).getTime()
    })

    const stats = files.reduce(
      (acc, file) => {
        acc.total_files += 1
        acc.total_size += file.file_size ?? 0
        acc.by_status[file.status] = (acc.by_status[file.status] || 0) + 1
        acc.by_category[file.category] = (acc.by_category[file.category] || 0) + 1
        const uploadedAt = new Date(file.uploaded_at).getTime()
        if (!acc.latest_upload_at || uploadedAt > new Date(acc.latest_upload_at).getTime()) {
          acc.latest_upload_at = file.uploaded_at
        }
        const activityAt = new Date(file.metrics.last_activity_at || file.uploaded_at).getTime()
        if (!acc.latest_activity_at || activityAt > new Date(acc.latest_activity_at).getTime()) {
          acc.latest_activity_at = file.metrics.last_activity_at || file.uploaded_at
        }
        return acc
      },
      {
        total_files: 0,
        total_size: 0,
        latest_upload_at: null as string | null,
        latest_activity_at: null as string | null,
        by_status: {
          queued: 0,
          processing: 0,
          completed: 0,
          failed: 0,
          uploaded: 0,
          missing: 0,
        } as Record<FileStatus, number>,
        by_category: {
          script: 0,
          document: 0,
          image: 0,
          other: 0,
        } as Record<FileCategory, number>,
      }
    )

    const response = {
      project: {
        id: project.id,
        title: project.title,
        owner_id: project.owner_id,
      },
      files,
      stats,
      storage: {
        issues: knownStorageIssues,
        last_verified_at: filesWithPaths.length > 0 ? new Date().toISOString() : null,
      },
      meta: {
        generated_at: new Date().toISOString(),
        total_files: files.length,
      },
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('[project-files] Unexpected error', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
