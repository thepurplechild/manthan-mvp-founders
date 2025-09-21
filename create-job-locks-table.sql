-- Job Locks Table for Cron Processing
-- This table provides a locking mechanism to prevent multiple cron instances
-- from processing jobs concurrently

-- Create the job_locks table with a single row for the processing lock
CREATE TABLE IF NOT EXISTS public.job_locks (
  id integer PRIMARY KEY DEFAULT 1, -- Always 1 for singleton lock
  locked_at timestamptz,
  lock_id uuid,
  locked_by text, -- Optional: for debugging which process holds the lock
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Ensure only one row can exist (singleton pattern)
ALTER TABLE public.job_locks
ADD CONSTRAINT job_locks_singleton_check CHECK (id = 1);

-- Insert the initial row if it doesn't exist
INSERT INTO public.job_locks (id, locked_at, lock_id, locked_by, expires_at)
VALUES (1, NULL, NULL, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- Create an index for efficient lock checking
CREATE INDEX IF NOT EXISTS idx_job_locks_expires_at ON public.job_locks(expires_at);

-- Enable RLS (Row Level Security) for the table
ALTER TABLE public.job_locks ENABLE ROW LEVEL SECURITY;

-- Allow service role to have full access to the locks table
CREATE POLICY IF NOT EXISTS "job_locks_service_role_all" ON public.job_locks
FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Create a function to acquire a processing lock atomically
CREATE OR REPLACE FUNCTION public.acquire_processing_lock(
    p_lock_id uuid,
    p_locked_by text DEFAULT NULL,
    p_timeout_minutes integer DEFAULT 5
) RETURNS boolean AS $$
DECLARE
    lock_acquired boolean := false;
    expiry_time timestamptz := now() + (p_timeout_minutes || ' minutes')::interval;
BEGIN
    -- Try to acquire the lock using SELECT ... FOR UPDATE to ensure atomicity
    UPDATE public.job_locks
    SET
        locked_at = now(),
        lock_id = p_lock_id,
        locked_by = p_locked_by,
        expires_at = expiry_time,
        updated_at = now()
    WHERE id = 1
      AND (
        locked_at IS NULL
        OR expires_at IS NULL
        OR expires_at < now()
      );

    -- Check if we successfully acquired the lock
    GET DIAGNOSTICS lock_acquired = ROW_COUNT;

    RETURN lock_acquired > 0;

EXCEPTION WHEN OTHERS THEN
    -- If any error occurs, return false
    RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a function to release a processing lock
CREATE OR REPLACE FUNCTION public.release_processing_lock(
    p_lock_id uuid
) RETURNS boolean AS $$
DECLARE
    lock_released boolean := false;
BEGIN
    -- Only release if the lock_id matches (prevents accidental releases)
    UPDATE public.job_locks
    SET
        locked_at = NULL,
        lock_id = NULL,
        locked_by = NULL,
        expires_at = NULL,
        updated_at = now()
    WHERE id = 1
      AND lock_id = p_lock_id;

    -- Check if we successfully released the lock
    GET DIAGNOSTICS lock_released = ROW_COUNT;

    RETURN lock_released > 0;

EXCEPTION WHEN OTHERS THEN
    -- If any error occurs, return false
    RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a function to cleanup expired locks
CREATE OR REPLACE FUNCTION public.cleanup_expired_locks() RETURNS integer AS $$
DECLARE
    cleaned_count integer := 0;
BEGIN
    -- Clean up any expired locks
    UPDATE public.job_locks
    SET
        locked_at = NULL,
        lock_id = NULL,
        locked_by = NULL,
        expires_at = NULL,
        updated_at = now()
    WHERE id = 1
      AND expires_at IS NOT NULL
      AND expires_at < now();

    GET DIAGNOSTICS cleaned_count = ROW_COUNT;

    RETURN cleaned_count;

EXCEPTION WHEN OTHERS THEN
    RETURN 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions to service role
GRANT EXECUTE ON FUNCTION public.acquire_processing_lock TO service_role;
GRANT EXECUTE ON FUNCTION public.release_processing_lock TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_locks TO service_role;

-- Create automatic cleanup trigger for expired locks
CREATE OR REPLACE FUNCTION public.auto_cleanup_expired_locks() RETURNS trigger AS $$
BEGIN
    -- Automatically clean up expired locks on any read
    PERFORM public.cleanup_expired_locks();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger that cleans up expired locks when the table is queried
DROP TRIGGER IF EXISTS auto_cleanup_expired_locks_trigger ON public.job_locks;
CREATE TRIGGER auto_cleanup_expired_locks_trigger
    BEFORE SELECT ON public.job_locks
    FOR EACH STATEMENT
    EXECUTE FUNCTION public.auto_cleanup_expired_locks();