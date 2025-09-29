import type { UrlObject } from 'url'
import type { Route } from 'next'
import type { Project, ScriptUpload } from './database'

export type TimelineStatus = 'pending' | 'current' | 'completed'

export interface ProjectTimelineEntry {
  key: string
  label: string
  description: string
  status: TimelineStatus
  timestamp: string | null
  meta?: Record<string, unknown>
}

export interface ProjectNextAction {
  key: string
  title: string
  description: string
  href?: Route | UrlObject
  ctaLabel?: string
}

export interface ProjectIngestionStepSummary {
  id: string
  name: string
  status: string
  started_at: string | null
  finished_at: string | null
  attempt: number | null
  error: string | null
}

export interface ProjectIngestionSummary {
  id: string
  status: string
  progress: number
  created_at: string
  updated_at: string | null
  source_file_url: string
  mime_type: string | null
  error: string | null
  steps: ProjectIngestionStepSummary[]
}

export interface ProjectFileSummary {
  id: string
  file_name: string
  version: number
  status: string | null
  category: string | null
  uploaded_at: string
  file_size: number | null
  ingestion_id: string | null
  ingestion_status: string | null
  ingestion_progress: number | null
  storage_exists: boolean
  last_verified_at: string | null
}

export interface ProjectOutputsSummary {
  total_assets: number
  documents: number
  decks: number
  images: number
  content_items: number
  packages: number
  last_generated_at: string | null
}

export interface ProjectOverviewStats {
  total_files: number
  active_ingestions: number
  completed_ingestions: number
  failed_ingestions: number
  latest_upload_at: string | null
  last_processed_at: string | null
}

export interface ProjectOverviewResponse {
  project: Project
  files: ProjectFileSummary[]
  ingestions: ProjectIngestionSummary[]
  stats: ProjectOverviewStats
  outputs: ProjectOutputsSummary
  timeline: ProjectTimelineEntry[]
  next_actions: ProjectNextAction[]
}

export interface ProjectOutputsResponse {
  assets: Array<{
    id: string
    kind: string
    storage_path: string
    bytes: number | null
    created_at: string
    metadata: Record<string, unknown> | null
  }>
  content: Array<{
    id: string
    step: string
    created_at: string
    payload: Record<string, unknown> | null
  }>
  packages: Array<{
    id: string
    ingestion_id: string
    summary: string | null
    deck_url: string | null
    document_url: string | null
    artifacts: Record<string, unknown> | null
    created_at: string
  }>
  last_generated_at: string | null
}
