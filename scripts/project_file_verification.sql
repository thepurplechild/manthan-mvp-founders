-- Project File Management Verification Queries
-- Use these in Supabase SQL editor to sanity-check metadata and associations

-- 1. Fetch files for a specific project with processing + storage metadata
SELECT
  su.id AS script_upload_id,
  su.project_id,
  su.file_name,
  su.version,
  su.category,
  su.status,
  su.mime_type,
  su.file_size,
  su.storage_bucket,
  su.storage_exists,
  su.last_verified_at,
  su.antivirus_status,
  su.validation_status,
  ing.status AS ingestion_status,
  ing.progress AS ingestion_progress,
  ing.created_at AS ingestion_created_at
FROM public.script_uploads su
LEFT JOIN LATERAL (
  SELECT i.id, i.status, i.progress, i.created_at
  FROM public.ingestions i
  WHERE i.project_id = su.project_id
    AND i.source_file_url = su.file_path
  ORDER BY i.created_at DESC
  LIMIT 1
) AS ing ON TRUE
WHERE su.project_id = :project_id
ORDER BY su.uploaded_at DESC;

-- 2. Validate every ingestion is associated with an upload + project
SELECT
  i.id AS ingestion_id,
  i.project_id,
  i.source_file_url,
  su.id AS script_upload_id,
  su.status AS script_upload_status
FROM public.ingestions i
LEFT JOIN public.script_uploads su
  ON su.project_id = i.project_id
  AND su.file_path = i.source_file_url
WHERE i.project_id = :project_id
ORDER BY i.created_at DESC;

-- 3. List files flagged as missing in storage
SELECT
  su.id,
  su.project_id,
  su.file_name,
  su.file_path,
  su.last_verified_at
FROM public.script_uploads su
WHERE su.storage_exists = FALSE
ORDER BY su.last_verified_at DESC;

-- 4. Check aggregate stats for dashboard parity
SELECT
  su.project_id,
  COUNT(*) AS total_files,
  COUNT(*) FILTER (WHERE su.status = 'completed') AS completed_files,
  COUNT(*) FILTER (WHERE su.status IN ('processing','queued')) AS active_files,
  SUM(su.file_size) AS total_size
FROM public.script_uploads su
GROUP BY su.project_id;
