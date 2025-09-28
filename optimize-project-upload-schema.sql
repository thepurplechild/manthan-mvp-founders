-- Optimize Project Upload Schema for Better Performance
-- Run this in Supabase SQL Editor after the main database setup

-- Add performance indexes for frequent queries
CREATE INDEX IF NOT EXISTS idx_ingestions_project_id ON public.ingestions(project_id);
CREATE INDEX IF NOT EXISTS idx_ingestions_user_id ON public.ingestions(user_id);
CREATE INDEX IF NOT EXISTS idx_ingestions_status ON public.ingestions(status);
CREATE INDEX IF NOT EXISTS idx_ingestions_created_at ON public.ingestions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ingestions_project_status ON public.ingestions(project_id, status);

-- Add composite index for common project upload queries
CREATE INDEX IF NOT EXISTS idx_ingestions_project_user_status ON public.ingestions(project_id, user_id, status);

-- Add index for project ownership validation
CREATE INDEX IF NOT EXISTS idx_projects_owner_id ON public.projects(owner_id);

-- Add index for ingestion steps queries
CREATE INDEX IF NOT EXISTS idx_ingestion_steps_ingestion_id ON public.ingestion_steps(ingestion_id);
CREATE INDEX IF NOT EXISTS idx_ingestion_steps_status ON public.ingestion_steps(status);

-- Ensure foreign key constraints are properly set
ALTER TABLE public.ingestions
ADD CONSTRAINT fk_ingestions_project_id
FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE
ON UPDATE CASCADE;

-- Add constraint to ensure project_id is not null for new uploads
-- (allow existing null records but require project_id for new ones)
-- First, let's check if there are any existing null project_id records
DO $$
DECLARE
  null_count integer;
  cutoff_date timestamp;
BEGIN
  -- Set cutoff date to current time to allow all existing records
  cutoff_date := NOW();

  -- Count existing null records
  SELECT COUNT(*) INTO null_count
  FROM public.ingestions
  WHERE project_id IS NULL;

  IF null_count > 0 THEN
    RAISE NOTICE 'Found % existing ingestions with null project_id, setting cutoff to %', null_count, cutoff_date;

    -- Add constraint that allows existing null records but requires project_id for future uploads
    ALTER TABLE public.ingestions
    ADD CONSTRAINT chk_project_id_required
    CHECK (created_at < cutoff_date OR project_id IS NOT NULL);
  ELSE
    RAISE NOTICE 'No existing null project_id records found, adding strict constraint';

    -- Add strict constraint since no existing nulls
    ALTER TABLE public.ingestions
    ADD CONSTRAINT chk_project_id_required
    CHECK (project_id IS NOT NULL);
  END IF;
END $$;

-- Add helpful database functions for project upload workflow
CREATE OR REPLACE FUNCTION public.get_project_upload_summary(p_project_id uuid)
RETURNS TABLE (
  total_uploads bigint,
  successful_uploads bigint,
  failed_uploads bigint,
  processing_uploads bigint,
  queued_uploads bigint,
  latest_upload_date timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*) as total_uploads,
    COUNT(*) FILTER (WHERE status = 'succeeded') as successful_uploads,
    COUNT(*) FILTER (WHERE status = 'failed') as failed_uploads,
    COUNT(*) FILTER (WHERE status = 'running' OR status = 'processing') as processing_uploads,
    COUNT(*) FILTER (WHERE status = 'queued') as queued_uploads,
    MAX(created_at) as latest_upload_date
  FROM public.ingestions
  WHERE project_id = p_project_id;
END;
$$;

-- Grant permissions for the summary function
GRANT EXECUTE ON FUNCTION public.get_project_upload_summary TO authenticated;

-- Add function to check if user can upload to project
CREATE OR REPLACE FUNCTION public.can_user_upload_to_project(p_user_id uuid, p_project_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  project_owner uuid;
BEGIN
  SELECT owner_id INTO project_owner
  FROM public.projects
  WHERE id = p_project_id;

  -- Return true if user owns the project
  RETURN project_owner = p_user_id;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.can_user_upload_to_project TO authenticated;

-- Add trigger to automatically update project status when uploads complete
CREATE OR REPLACE FUNCTION public.update_project_on_upload_complete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- When an ingestion succeeds, we could update the project status
  -- This is optional - implement based on your business logic
  IF NEW.status = 'succeeded' AND OLD.status != 'succeeded' THEN
    UPDATE public.projects
    SET status = 'active'
    WHERE id = NEW.project_id AND status = 'draft';
  END IF;

  RETURN NEW;
END;
$$;

-- Create the trigger
DROP TRIGGER IF EXISTS tr_update_project_on_upload_complete ON public.ingestions;
CREATE TRIGGER tr_update_project_on_upload_complete
  AFTER UPDATE ON public.ingestions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_project_on_upload_complete();

-- Add helpful view for project dashboard
CREATE OR REPLACE VIEW public.project_upload_status AS
SELECT
  p.id as project_id,
  p.title as project_title,
  p.owner_id,
  p.status as project_status,
  p.created_at as project_created_at,
  COUNT(i.id) as total_uploads,
  COUNT(i.id) FILTER (WHERE i.status = 'succeeded') as successful_uploads,
  COUNT(i.id) FILTER (WHERE i.status = 'failed') as failed_uploads,
  COUNT(i.id) FILTER (WHERE i.status = 'queued' OR i.status = 'running') as active_uploads,
  MAX(i.created_at) as latest_upload_date,
  MAX(i.updated_at) as latest_activity_date
FROM public.projects p
LEFT JOIN public.ingestions i ON p.id = i.project_id
GROUP BY p.id, p.title, p.owner_id, p.status, p.created_at;

-- Grant access to the view
GRANT SELECT ON public.project_upload_status TO authenticated;

-- Add RLS policy for the view
ALTER VIEW public.project_upload_status SET (security_barrier = true);

-- Note: Views inherit RLS from underlying tables, so existing project RLS policies apply

-- Add cleanup function for old failed uploads (optional - for maintenance)
CREATE OR REPLACE FUNCTION public.cleanup_old_failed_uploads(days_old integer DEFAULT 30)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count integer;
BEGIN
  -- Delete failed uploads older than specified days
  DELETE FROM public.ingestions
  WHERE status = 'failed'
    AND created_at < (NOW() - (days_old || ' days')::interval);

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  RETURN deleted_count;
END;
$$;

-- Grant to service role only (for maintenance)
GRANT EXECUTE ON FUNCTION public.cleanup_old_failed_uploads TO service_role;

-- Add comments for documentation
COMMENT ON INDEX idx_ingestions_project_id IS 'Index for fast project-based ingestion queries';
COMMENT ON INDEX idx_ingestions_project_user_status IS 'Composite index for project upload dashboard queries';
COMMENT ON FUNCTION public.get_project_upload_summary IS 'Returns upload statistics for a project';
COMMENT ON FUNCTION public.can_user_upload_to_project IS 'Security function to validate upload permissions';
COMMENT ON VIEW public.project_upload_status IS 'Dashboard view showing project upload statistics';

-- Analyze tables for optimal query planning
ANALYZE public.projects;
ANALYZE public.ingestions;
ANALYZE public.ingestion_steps;