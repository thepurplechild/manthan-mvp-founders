-- Project File Metadata & Integrity Enhancements
-- Adds rich metadata tracking for uploaded files and keeps storage state in sync

-- 1) Extend script_uploads with metadata columns (idempotent)
ALTER TABLE public.script_uploads
  ADD COLUMN IF NOT EXISTS mime_type TEXT;

ALTER TABLE public.script_uploads
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'uploaded';

ALTER TABLE public.script_uploads
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'document';

ALTER TABLE public.script_uploads
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

ALTER TABLE public.script_uploads
  ADD COLUMN IF NOT EXISTS checksum TEXT;

ALTER TABLE public.script_uploads
  ADD COLUMN IF NOT EXISTS antivirus_status TEXT NOT NULL DEFAULT 'pending';

ALTER TABLE public.script_uploads
  ADD COLUMN IF NOT EXISTS antivirus_scanned_at TIMESTAMPTZ;

ALTER TABLE public.script_uploads
  ADD COLUMN IF NOT EXISTS validation_status TEXT NOT NULL DEFAULT 'pending';

ALTER TABLE public.script_uploads
  ADD COLUMN IF NOT EXISTS validation_notes TEXT;

ALTER TABLE public.script_uploads
  ADD COLUMN IF NOT EXISTS storage_bucket TEXT NOT NULL DEFAULT 'scripts';

ALTER TABLE public.script_uploads
  ADD COLUMN IF NOT EXISTS storage_exists BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE public.script_uploads
  ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ;

ALTER TABLE public.script_uploads
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- 2) Ensure status/category domains are restricted
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'script_uploads_status_check'
      AND conrelid = 'public.script_uploads'::regclass
  ) THEN
    ALTER TABLE public.script_uploads
      ADD CONSTRAINT script_uploads_status_check
      CHECK (status IN ('uploaded', 'queued', 'processing', 'completed', 'failed', 'missing'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'script_uploads_category_check'
      AND conrelid = 'public.script_uploads'::regclass
  ) THEN
    ALTER TABLE public.script_uploads
      ADD CONSTRAINT script_uploads_category_check
      CHECK (category IN ('script', 'document', 'image', 'other'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'script_uploads_antivirus_status_check'
      AND conrelid = 'public.script_uploads'::regclass
  ) THEN
    ALTER TABLE public.script_uploads
      ADD CONSTRAINT script_uploads_antivirus_status_check
      CHECK (antivirus_status IN ('pending', 'scanning', 'clean', 'flagged', 'failed'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'script_uploads_validation_status_check'
      AND conrelid = 'public.script_uploads'::regclass
  ) THEN
    ALTER TABLE public.script_uploads
      ADD CONSTRAINT script_uploads_validation_status_check
      CHECK (validation_status IN ('pending', 'passed', 'failed'));
  END IF;
END $$;

-- 3) Backfill metadata for existing rows
UPDATE public.script_uploads su
SET mime_type = COALESCE(mime_type,
  CASE
    WHEN su.file_name ILIKE '%.pdf' THEN 'application/pdf'
    WHEN su.file_name ILIKE '%.txt' THEN 'text/plain'
    WHEN su.file_name ILIKE '%.docx' THEN 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    WHEN su.file_name ILIKE '%.doc' THEN 'application/msword'
    WHEN su.file_name ILIKE '%.png' THEN 'image/png'
    WHEN su.file_name ILIKE '%.jpg' OR su.file_name ILIKE '%.jpeg' THEN 'image/jpeg'
    ELSE 'application/octet-stream'
  END);

UPDATE public.script_uploads su
SET category = CASE
  WHEN mime_type LIKE 'image/%' THEN 'image'
  WHEN mime_type IN ('application/pdf') THEN 'document'
  WHEN mime_type IN (
    'text/plain',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword'
  ) THEN 'script'
  ELSE 'other'
END;

UPDATE public.script_uploads
SET antivirus_status = 'pending'
WHERE antivirus_status IS NULL;

UPDATE public.script_uploads
SET validation_status = 'pending'
WHERE validation_status IS NULL;

UPDATE public.script_uploads
SET storage_bucket = 'scripts'
WHERE storage_bucket IS NULL;

UPDATE public.script_uploads
SET storage_exists = TRUE
WHERE storage_exists IS NULL;

UPDATE public.script_uploads
SET last_verified_at = COALESCE(last_verified_at, uploaded_at);

-- 4) Align file status with the latest ingestion status when available
WITH latest_ingestions AS (
  SELECT DISTINCT ON (source_file_url)
    source_file_url,
    status,
    created_at
  FROM public.ingestions
  ORDER BY source_file_url, created_at DESC
)
UPDATE public.script_uploads su
SET status = CASE
  WHEN li.status = 'queued' THEN 'queued'
  WHEN li.status = 'running' THEN 'processing'
  WHEN li.status = 'succeeded' THEN 'completed'
  WHEN li.status = 'failed' THEN 'failed'
  ELSE su.status
END
FROM latest_ingestions li
WHERE li.source_file_url = su.file_path;

-- 5) Backfill version numbers based on upload order
WITH ordered AS (
  SELECT
    id,
    ROW_NUMBER() OVER (PARTITION BY project_id, file_name ORDER BY uploaded_at) AS rn
  FROM public.script_uploads
)
UPDATE public.script_uploads su
SET version = ordered.rn
FROM ordered
WHERE ordered.id = su.id;

-- 6) Add helpful indexes for project/file lookups
CREATE INDEX IF NOT EXISTS idx_script_uploads_project_file
  ON public.script_uploads(project_id, file_name, version DESC);

CREATE INDEX IF NOT EXISTS idx_script_uploads_project_status
  ON public.script_uploads(project_id, status);

-- 7) Maintain updated_at automatically
CREATE OR REPLACE FUNCTION public.set_script_uploads_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_script_uploads_set_updated_at ON public.script_uploads;
CREATE TRIGGER trg_script_uploads_set_updated_at
  BEFORE UPDATE ON public.script_uploads
  FOR EACH ROW
  EXECUTE FUNCTION public.set_script_uploads_updated_at();

-- 8) Grant access for authenticated users to metadata columns (inherits from existing policies)
-- No additional RLS changes are required because policies grant SELECT on the full row.
