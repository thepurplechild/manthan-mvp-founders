-- Fix Creator Rights Acceptance Schema (Alternative Approach)
-- Add unique constraint that the RPC function expects

-- Add unique constraint on user_id (users should only accept once)
-- Use IF NOT EXISTS to avoid errors if already exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'creator_rights_acceptances_user_id_unique'
    ) THEN
        ALTER TABLE public.creator_rights_acceptances
        ADD CONSTRAINT creator_rights_acceptances_user_id_unique
        UNIQUE (user_id);
    END IF;
END $$;

-- Check current function and replace with proper version
DO $$
DECLARE
    func_exists boolean;
BEGIN
    -- Check if function exists
    SELECT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.proname = 'record_rights_acceptance'
    ) INTO func_exists;

    -- Drop existing function if it exists
    IF func_exists THEN
        DROP FUNCTION public.record_rights_acceptance CASCADE;
    END IF;
END $$;

-- Create the corrected RPC function
CREATE FUNCTION public.record_rights_acceptance(
  p_user_id uuid,
  p_version text default '1.0 - MVP Launch',
  p_ip_address inet default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  result uuid;
begin
  -- Try to insert new record
  insert into public.creator_rights_acceptances (user_id, version, ip_address)
  values (p_user_id, coalesce(p_version, '1.0 - MVP Launch'), p_ip_address)
  on conflict (user_id) do update set
    version = excluded.version,
    ip_address = excluded.ip_address,
    accepted_at = now()
  returning id into result;

  -- Return the ID
  return result;
end;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.record_rights_acceptance TO authenticated, service_role;