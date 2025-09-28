-- Job Recovery System: Enhanced tracking and monitoring for processing jobs
-- Adds comprehensive job tracking fields and recovery management capabilities
-- Safe, backward-compatible migration for Postgres 15 (Supabase)

-- 1) Create job_events table for comprehensive logging
CREATE TABLE IF NOT EXISTS public.job_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  ingestion_id uuid REFERENCES public.ingestions(id) ON DELETE CASCADE,
  job_type text NOT NULL CHECK (job_type IN ('ai_processing', 'ingestion')),
  job_id uuid NOT NULL, -- References either ai_processing_status.id or ingestion_steps.id
  event_type text NOT NULL CHECK (event_type IN ('created', 'started', 'completed', 'failed', 'retried', 'cancelled', 'recovered')),
  previous_status text,
  new_status text,
  error_details jsonb,
  processing_duration_ms bigint,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2) Enhance ai_processing_status table with recovery fields
ALTER TABLE public.ai_processing_status
  ADD COLUMN IF NOT EXISTS max_retries int NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS last_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS processing_duration_ms bigint,
  ADD COLUMN IF NOT EXISTS priority int NOT NULL DEFAULT 5, -- 1=highest, 10=lowest
  ADD COLUMN IF NOT EXISTS recovery_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_heartbeat timestamptz;

-- 3) Enhance ingestion_steps table with recovery fields
ALTER TABLE public.ingestion_steps
  ADD COLUMN IF NOT EXISTS max_retries int NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS last_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS processing_duration_ms bigint,
  ADD COLUMN IF NOT EXISTS priority int NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS recovery_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_heartbeat timestamptz;

-- 4) Create unified processing_jobs view for easier management
CREATE OR REPLACE VIEW public.v_processing_jobs AS
SELECT
  'ai_processing' as job_type,
  aps.id,
  aps.project_id,
  NULL::uuid as ingestion_id,
  aps.step as job_name,
  aps.status,
  aps.started_at,
  aps.finished_at,
  aps.retry_count,
  aps.max_retries,
  aps.last_retry_at,
  aps.error_message,
  aps.processing_duration_ms,
  aps.priority,
  aps.recovery_count,
  aps.last_heartbeat,
  aps.created_at,
  CASE
    WHEN aps.status = 'running' AND aps.started_at < now() - interval '30 minutes' THEN true
    WHEN aps.status = 'pending' AND aps.created_at < now() - interval '10 minutes' THEN true
    ELSE false
  END as is_stuck,
  CASE
    WHEN aps.retry_count >= aps.max_retries THEN true
    ELSE false
  END as max_retries_reached
FROM public.ai_processing_status aps
WHERE aps.status IN ('pending', 'running', 'failed')

UNION ALL

SELECT
  'ingestion' as job_type,
  ist.id,
  ing.project_id,
  ist.ingestion_id,
  ist.name::text as job_name,
  ist.status::text,
  ist.started_at,
  ist.finished_at,
  ist.attempt as retry_count,
  ist.max_retries,
  ist.last_retry_at,
  ist.error as error_message,
  ist.processing_duration_ms,
  ist.priority,
  ist.recovery_count,
  ist.last_heartbeat,
  ing.created_at,
  CASE
    WHEN ist.status::text = 'running' AND ist.started_at < now() - interval '30 minutes' THEN true
    WHEN ist.status::text = 'queued' AND ing.created_at < now() - interval '10 minutes' THEN true
    ELSE false
  END as is_stuck,
  CASE
    WHEN ist.attempt >= ist.max_retries THEN true
    ELSE false
  END as max_retries_reached
FROM public.ingestion_steps ist
JOIN public.ingestions ing ON ing.id = ist.ingestion_id
WHERE ist.status::text IN ('queued', 'running', 'failed');

-- 5) Create indexes for efficient job recovery queries
CREATE INDEX IF NOT EXISTS idx_ai_processing_status_recovery
ON public.ai_processing_status(status, created_at, started_at)
WHERE status IN ('pending', 'running', 'failed');

CREATE INDEX IF NOT EXISTS idx_ingestion_steps_recovery
ON public.ingestion_steps(status, started_at)
WHERE status IN ('queued', 'running', 'failed');

CREATE INDEX IF NOT EXISTS idx_job_events_lookup
ON public.job_events(job_type, job_id, created_at);

CREATE INDEX IF NOT EXISTS idx_job_events_timeline
ON public.job_events(created_at, event_type);

-- 6) RLS for job_events table
ALTER TABLE public.job_events ENABLE ROW LEVEL SECURITY;

-- Users can see events for their own projects/ingestions
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='job_events' AND policyname='job_events_owner_read'
  ) THEN
    CREATE POLICY job_events_owner_read ON public.job_events
      FOR SELECT TO authenticated USING (
        (project_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.projects p WHERE p.id = job_events.project_id AND p.owner_id = auth.uid()
        )) OR
        (ingestion_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.ingestions i WHERE i.id = job_events.ingestion_id AND i.user_id = auth.uid()
        ))
      );
  END IF;
END $$;

-- Service role can manage all job events
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='job_events' AND policyname='job_events_service_all'
  ) THEN
    CREATE POLICY job_events_service_all ON public.job_events FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 7) Job management functions

-- Function to log job events
CREATE OR REPLACE FUNCTION public.fn_log_job_event(
  p_project_id uuid,
  p_ingestion_id uuid,
  p_job_type text,
  p_job_id uuid,
  p_event_type text,
  p_previous_status text DEFAULT NULL,
  p_new_status text DEFAULT NULL,
  p_error_details jsonb DEFAULT NULL,
  p_processing_duration_ms bigint DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid AS $$
DECLARE
  new_event_id uuid;
BEGIN
  INSERT INTO public.job_events (
    project_id, ingestion_id, job_type, job_id, event_type,
    previous_status, new_status, error_details, processing_duration_ms, metadata
  )
  VALUES (
    p_project_id, p_ingestion_id, p_job_type, p_job_id, p_event_type,
    p_previous_status, p_new_status, p_error_details, p_processing_duration_ms, p_metadata
  )
  RETURNING id INTO new_event_id;

  RETURN new_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to mark AI processing job as processing
CREATE OR REPLACE FUNCTION public.fn_mark_ai_job_processing(
  p_project_id uuid,
  p_step text
)
RETURNS void AS $$
DECLARE
  job_record record;
BEGIN
  -- Get current job info and update
  UPDATE public.ai_processing_status
  SET
    status = 'running',
    started_at = COALESCE(started_at, now()),
    last_heartbeat = now()
  WHERE project_id = p_project_id AND step = p_step
  RETURNING * INTO job_record;

  -- Log the event
  PERFORM public.fn_log_job_event(
    p_project_id, NULL, 'ai_processing', job_record.id, 'started',
    'pending', 'running'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to mark AI processing job as completed
CREATE OR REPLACE FUNCTION public.fn_mark_ai_job_completed(
  p_project_id uuid,
  p_step text,
  p_processing_duration_ms bigint DEFAULT NULL
)
RETURNS void AS $$
DECLARE
  job_record record;
  duration_ms bigint;
BEGIN
  -- Calculate duration if not provided
  IF p_processing_duration_ms IS NULL THEN
    SELECT EXTRACT(EPOCH FROM (now() - started_at)) * 1000 INTO duration_ms
    FROM public.ai_processing_status
    WHERE project_id = p_project_id AND step = p_step;
  ELSE
    duration_ms := p_processing_duration_ms;
  END IF;

  -- Update job
  UPDATE public.ai_processing_status
  SET
    status = 'completed',
    finished_at = now(),
    processing_duration_ms = duration_ms
  WHERE project_id = p_project_id AND step = p_step
  RETURNING * INTO job_record;

  -- Log the event
  PERFORM public.fn_log_job_event(
    p_project_id, NULL, 'ai_processing', job_record.id, 'completed',
    'running', 'completed', NULL, duration_ms
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to mark AI processing job as failed
CREATE OR REPLACE FUNCTION public.fn_mark_ai_job_failed(
  p_project_id uuid,
  p_step text,
  p_error_message text,
  p_error_details jsonb DEFAULT NULL
)
RETURNS void AS $$
DECLARE
  job_record record;
  duration_ms bigint;
BEGIN
  -- Calculate duration
  SELECT EXTRACT(EPOCH FROM (now() - COALESCE(started_at, created_at))) * 1000 INTO duration_ms
  FROM public.ai_processing_status
  WHERE project_id = p_project_id AND step = p_step;

  -- Update job
  UPDATE public.ai_processing_status
  SET
    status = 'failed',
    finished_at = now(),
    error_message = p_error_message,
    retry_count = retry_count + 1,
    last_retry_at = now(),
    processing_duration_ms = duration_ms
  WHERE project_id = p_project_id AND step = p_step
  RETURNING * INTO job_record;

  -- Log the event
  PERFORM public.fn_log_job_event(
    p_project_id, NULL, 'ai_processing', job_record.id, 'failed',
    'running', 'failed', p_error_details, duration_ms
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to recover stuck jobs
CREATE OR REPLACE FUNCTION public.fn_recover_stuck_jobs()
RETURNS jsonb AS $$
DECLARE
  recovery_result jsonb := '{"recovered_count": 0, "jobs": []}'::jsonb;
  job_record record;
  recovered_jobs jsonb := '[]'::jsonb;
  recovery_count int := 0;
BEGIN
  -- Recover stuck AI processing jobs
  FOR job_record IN
    SELECT * FROM public.v_processing_jobs
    WHERE is_stuck = true AND max_retries_reached = false
  LOOP
    recovery_count := recovery_count + 1;

    IF job_record.job_type = 'ai_processing' THEN
      -- Reset AI processing job
      UPDATE public.ai_processing_status
      SET
        status = 'pending',
        started_at = NULL,
        finished_at = NULL,
        recovery_count = recovery_count + 1,
        last_heartbeat = NULL
      WHERE id = job_record.id;

      -- Log recovery event
      PERFORM public.fn_log_job_event(
        job_record.project_id, NULL, 'ai_processing', job_record.id, 'recovered',
        job_record.status, 'pending',
        jsonb_build_object('reason', 'stuck_job_recovery', 'previous_status', job_record.status)
      );

    ELSIF job_record.job_type = 'ingestion' THEN
      -- Reset ingestion step
      UPDATE public.ingestion_steps
      SET
        status = 'queued',
        started_at = NULL,
        finished_at = NULL,
        recovery_count = recovery_count + 1,
        last_heartbeat = NULL
      WHERE id = job_record.id;

      -- Log recovery event
      PERFORM public.fn_log_job_event(
        job_record.project_id, job_record.ingestion_id, 'ingestion', job_record.id, 'recovered',
        job_record.status, 'queued',
        jsonb_build_object('reason', 'stuck_job_recovery', 'previous_status', job_record.status)
      );
    END IF;

    -- Add to recovered jobs list
    recovered_jobs := recovered_jobs || jsonb_build_object(
      'id', job_record.id,
      'type', job_record.job_type,
      'name', job_record.job_name,
      'previous_status', job_record.status,
      'project_id', job_record.project_id
    );
  END LOOP;

  -- Build result
  recovery_result := jsonb_build_object(
    'recovered_count', recovery_count,
    'jobs', recovered_jobs,
    'timestamp', extract(epoch from now())
  );

  RETURN recovery_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get job statistics
CREATE OR REPLACE FUNCTION public.fn_get_job_statistics(
  p_hours_back int DEFAULT 24
)
RETURNS jsonb AS $$
DECLARE
  stats jsonb;
  since_time timestamptz;
BEGIN
  since_time := now() - (p_hours_back || ' hours')::interval;

  WITH job_stats AS (
    SELECT
      job_type,
      status,
      COUNT(*) as count,
      AVG(processing_duration_ms) as avg_duration_ms,
      MAX(processing_duration_ms) as max_duration_ms,
      MIN(processing_duration_ms) as min_duration_ms
    FROM public.v_processing_jobs
    WHERE created_at >= since_time
    GROUP BY job_type, status
  ),
  overall_stats AS (
    SELECT
      COUNT(*) as total_jobs,
      COUNT(*) FILTER (WHERE status IN ('pending', 'queued')) as queued_count,
      COUNT(*) FILTER (WHERE status = 'running') as processing_count,
      COUNT(*) FILTER (WHERE status = 'failed') as failed_count,
      COUNT(*) FILTER (WHERE status IN ('completed', 'succeeded')) as completed_count,
      COUNT(*) FILTER (WHERE is_stuck = true) as stuck_count,
      AVG(processing_duration_ms) as avg_processing_time_ms
    FROM public.v_processing_jobs
    WHERE created_at >= since_time
  )
  SELECT jsonb_build_object(
    'period_hours', p_hours_back,
    'timestamp', extract(epoch from now()),
    'overall', to_jsonb(os),
    'by_type_and_status', (
      SELECT jsonb_object_agg(
        job_type || '_' || status,
        jsonb_build_object(
          'count', count,
          'avg_duration_ms', avg_duration_ms,
          'max_duration_ms', max_duration_ms,
          'min_duration_ms', min_duration_ms
        )
      )
      FROM job_stats
    )
  ) INTO stats
  FROM overall_stats os;

  RETURN COALESCE(stats, '{}'::jsonb);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8) Update heartbeat function for monitoring
CREATE OR REPLACE FUNCTION public.fn_update_job_heartbeat(
  p_job_type text,
  p_job_id uuid
)
RETURNS void AS $$
BEGIN
  IF p_job_type = 'ai_processing' THEN
    UPDATE public.ai_processing_status
    SET last_heartbeat = now()
    WHERE id = p_job_id;
  ELSIF p_job_type = 'ingestion' THEN
    UPDATE public.ingestion_steps
    SET last_heartbeat = now()
    WHERE id = p_job_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;