-- Manthan MVP: Critical Ingestion Pipeline Fixes
-- Run this in your Supabase SQL Editor to fix the ingestion pipeline

-- 1. Fix the missing 'visuals' step in the ENUM
ALTER TYPE public.step_name ADD VALUE IF NOT EXISTS 'visuals';

-- 2. Add missing database indexes for performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ingestions_status_user ON public.ingestions(status, user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ingestions_updated_at ON public.ingestions(updated_at) WHERE status = 'running';
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ingestion_steps_processing ON public.ingestion_steps(ingestion_id, status, name);

-- 3. Fix missing RLS policies for step updates
CREATE POLICY IF NOT EXISTS "ingestion_steps_owner_update" ON public.ingestion_steps
FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.ingestions i WHERE i.id = ingestion_id AND i.user_id = auth.uid())
);

CREATE POLICY IF NOT EXISTS "ingestion_steps_service_all" ON public.ingestion_steps
FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 4. Create atomic step update function
CREATE OR REPLACE FUNCTION public.update_step_status(
    p_ingestion_id uuid,
    p_step_name text,
    p_status text,
    p_output jsonb DEFAULT NULL,
    p_error text DEFAULT NULL
) RETURNS void AS $$
BEGIN
    UPDATE public.ingestion_steps
    SET status = p_status::step_status,
        started_at = CASE WHEN p_status = 'running' THEN now() ELSE started_at END,
        completed_at = CASE WHEN p_status IN ('succeeded','failed','skipped') THEN now() ELSE completed_at END,
        output_data = COALESCE(p_output, output_data),
        error_message = p_error,
        created_at = CASE WHEN created_at IS NULL THEN now() ELSE created_at END
    WHERE ingestion_id = p_ingestion_id AND name = p_step_name::step_name;

    -- Update parent ingestion progress
    UPDATE public.ingestions
    SET updated_at = now(),
        progress = (
            SELECT CAST(COUNT(*) FILTER (WHERE status = 'succeeded') * 100.0 / COUNT(*) AS INTEGER)
            FROM public.ingestion_steps
            WHERE ingestion_id = p_ingestion_id
        ),
        status = CASE
            WHEN EXISTS (SELECT 1 FROM public.ingestion_steps WHERE ingestion_id = p_ingestion_id AND status = 'failed') THEN 'failed'::ingestion_status
            WHEN (SELECT COUNT(*) FROM public.ingestion_steps WHERE ingestion_id = p_ingestion_id AND status = 'succeeded') =
                 (SELECT COUNT(*) FROM public.ingestion_steps WHERE ingestion_id = p_ingestion_id) THEN 'succeeded'::ingestion_status
            WHEN EXISTS (SELECT 1 FROM public.ingestion_steps WHERE ingestion_id = p_ingestion_id AND status = 'running') THEN 'running'::ingestion_status
            ELSE status
        END
    WHERE id = p_ingestion_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.update_step_status TO authenticated, service_role;