-- Migration script to create processing_jobs table for async job queue
-- This table manages the step-by-step processing of ingestion jobs

-- Create ENUM types for job status and steps
DO $$ BEGIN
    CREATE TYPE processing_job_status AS ENUM ('queued', 'running', 'succeeded', 'failed', 'retrying');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE processing_step AS ENUM (
        'extract_text',
        'generate_summary',
        'create_action_items',
        'finalize'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create processing_jobs table
CREATE TABLE IF NOT EXISTS public.processing_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ingestion_id UUID NOT NULL REFERENCES public.ingestions(id) ON DELETE CASCADE,
    step processing_step NOT NULL,
    status processing_job_status NOT NULL DEFAULT 'queued',
    payload JSONB DEFAULT '{}',
    result JSONB DEFAULT '{}',
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_processing_jobs_status ON public.processing_jobs(status);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_ingestion_id ON public.processing_jobs(ingestion_id);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_step ON public.processing_jobs(step);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_status_created ON public.processing_jobs(status, created_at);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_retry_queued ON public.processing_jobs(retry_count, status) WHERE status IN ('queued', 'retrying');

-- Ensure unique step per ingestion
CREATE UNIQUE INDEX IF NOT EXISTS idx_processing_jobs_ingestion_step
ON public.processing_jobs(ingestion_id, step);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_processing_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
CREATE TRIGGER processing_jobs_updated_at_trigger
    BEFORE UPDATE ON public.processing_jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_processing_jobs_updated_at();

-- RLS Policies
ALTER TABLE public.processing_jobs ENABLE ROW LEVEL SECURITY;

-- Users can view jobs for their own ingestions
CREATE POLICY processing_jobs_user_select ON public.processing_jobs
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.ingestions i
            WHERE i.id = processing_jobs.ingestion_id
            AND i.user_id = auth.uid()
        )
    );

-- Service role can do everything (for cron jobs)
CREATE POLICY processing_jobs_service_all ON public.processing_jobs
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- Function to create jobs for an ingestion
CREATE OR REPLACE FUNCTION create_processing_jobs(p_ingestion_id UUID)
RETURNS VOID AS $$
DECLARE
    job_steps processing_step[] := ARRAY['extract_text', 'generate_summary', 'create_action_items', 'finalize'];
    step processing_step;
BEGIN
    -- Delete existing jobs for this ingestion (in case of retry)
    DELETE FROM public.processing_jobs WHERE ingestion_id = p_ingestion_id;

    -- Create new jobs for each step
    FOREACH step IN ARRAY job_steps
    LOOP
        INSERT INTO public.processing_jobs (ingestion_id, step, status, payload)
        VALUES (p_ingestion_id, step, 'queued', '{}');
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get next available job
CREATE OR REPLACE FUNCTION get_next_processing_job()
RETURNS TABLE (
    job_id UUID,
    ingestion_id UUID,
    step processing_step,
    payload JSONB
) AS $$
DECLARE
    job_record RECORD;
BEGIN
    -- Lock and get the oldest queued or retrying job with retry_count < 3
    SELECT pj.id, pj.ingestion_id, pj.step, pj.payload
    INTO job_record
    FROM public.processing_jobs pj
    WHERE pj.status IN ('queued', 'retrying')
    AND pj.retry_count < 3
    ORDER BY
        CASE WHEN pj.status = 'queued' THEN 0 ELSE 1 END,
        pj.created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    IF job_record.id IS NOT NULL THEN
        -- Mark as running
        UPDATE public.processing_jobs
        SET
            status = 'running',
            started_at = NOW(),
            updated_at = NOW()
        WHERE id = job_record.id;

        -- Return the job details
        RETURN QUERY SELECT
            job_record.id,
            job_record.ingestion_id,
            job_record.step,
            job_record.payload;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update job status
CREATE OR REPLACE FUNCTION update_processing_job_status(
    p_job_id UUID,
    p_status processing_job_status,
    p_result JSONB DEFAULT NULL,
    p_error_message TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    UPDATE public.processing_jobs
    SET
        status = p_status,
        result = COALESCE(p_result, result),
        error_message = p_error_message,
        completed_at = CASE WHEN p_status IN ('succeeded', 'failed') THEN NOW() ELSE completed_at END,
        retry_count = CASE WHEN p_status = 'retrying' THEN retry_count + 1 ELSE retry_count END,
        updated_at = NOW()
    WHERE id = p_job_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON public.processing_jobs TO authenticated;
GRANT EXECUTE ON FUNCTION create_processing_jobs(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_next_processing_job() TO authenticated;
GRANT EXECUTE ON FUNCTION update_processing_job_status(UUID, processing_job_status, JSONB, TEXT) TO authenticated;