import type { ProjectIngestionSummary } from './projects'

export interface ReviewProject {
  id: string
  title: string
  description: string | null
  status: string
  logline: string | null
  synopsis: string | null
  genre: string[] | null
  created_at: string
  updated_at: string
  owner_id: string
  processing_status: string | null
  quality_score: number | null
  last_run_at: string | null
}

export interface ReviewProcessingStep {
  id: string
  project_id: string
  step: string
  status: string
  started_at: string | null
  finished_at: string | null
  error: string | null
  retry_count: number
  created_at: string
  metadata?: Record<string, unknown> | null
}

export interface ReviewGeneratedAsset {
  id: string
  project_id: string
  ingestion_id: string | null
  kind: string
  storage_path: string
  file_name: string | null
  bytes: number | null
  sha256: string | null
  status: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

export interface ReviewGeneratedContent {
  id: string
  project_id: string
  step: string
  payload: Record<string, unknown> | null
  created_at: string
}

export interface ReviewPackage {
  id: string
  ingestion_id: string
  summary: Record<string, unknown> | null
  deck_url: string | null
  document_url: string | null
  artifacts: Record<string, unknown> | null
  created_at: string
}

export interface ReviewFeedbackEntry {
  id: string
  text: string
  rating: number | null
  created_at: string
  author: string
}

export interface ReviewRevisionRequest {
  id: string
  feedback: string
  categories: string[]
  priority: 'low' | 'medium' | 'high'
  created_at: string
  status: string
}

export interface ProjectReviewData {
  project: ReviewProject
  ingestions: ProjectIngestionSummary[]
  processing_steps: ReviewProcessingStep[]
  generated_assets: ReviewGeneratedAsset[]
  generated_content: ReviewGeneratedContent[]
  packages: ReviewPackage[]
  approval_status: {
    approved: boolean
    approved_at: string | null
    approved_by: string | null
    feedback: ReviewFeedbackEntry[]
    revision_requests: ReviewRevisionRequest[]
  }
}
