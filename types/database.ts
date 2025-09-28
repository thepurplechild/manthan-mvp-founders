// types/database.ts - Create this file
export interface Profile {
  id: string
  full_name: string | null
  role: string
  created_at: string
}

export interface Project {
  id: string
  owner_id: string
  title: string
  status: string
  logline: string | null
  synopsis: string | null
  genre: string | null
  character_breakdowns: import('./common').JSONValue | null
  budget_range: string | null
  target_platforms: string | null
  created_at: string
  profiles?: Profile
  processing_status?: string | null
  quality_score?: number | null
  last_run_at?: string | null
  updated_at?: string
}

export interface ScriptUpload {
  id: string
  project_id: string
  file_path: string
  file_name: string | null
  file_size: number | null
  uploaded_at: string
  mime_type: string | null
  status: 'uploaded' | 'queued' | 'processing' | 'completed' | 'failed' | 'missing'
  category: 'script' | 'document' | 'image' | 'other'
  version: number
  checksum: string | null
  antivirus_status: 'pending' | 'scanning' | 'clean' | 'flagged' | 'failed'
  antivirus_scanned_at: string | null
  validation_status: 'pending' | 'passed' | 'failed'
  validation_notes: string | null
  storage_bucket: string
  storage_exists: boolean
  last_verified_at: string | null
  updated_at: string
}

export interface GeneratedAsset {
  id: string
  project_id: string
  asset_type: string
  asset_url: string | null
  version: number
  created_at: string
}

export interface PlatformMandate {
  id: string
  platform_name: string
  mandate_description: string
  tags: string | null
  source: string | null
  created_by: string | null
  created_at: string
}

export interface DealPipeline {
  id: string
  project_id: string
  target_buyer_name: string
  status: string
  feedback_notes: string | null
  updated_at: string
  projects?: {
    title: string
    profiles?: Profile
  }
}

export interface ProjectWithRelations extends Project {
  script_uploads?: ScriptUpload[]
  generated_assets?: GeneratedAsset[]
}
