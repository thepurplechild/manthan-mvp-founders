-- Fix Creator Rights Acceptance Schema (Workaround Approach)
-- This avoids the function name conflict by creating a new function

-- Add unique constraint on user_id (users should only accept once)
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

-- Create the corrected RPC function with a new name first
CREATE OR REPLACE FUNCTION public.record_rights_acceptance_v2(
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

-- Grant permissions to the new function
GRANT EXECUTE ON FUNCTION public.record_rights_acceptance_v2 TO authenticated, service_role;

-- Create a wrapper function that uses the old name but calls the new implementation
CREATE OR REPLACE FUNCTION public.record_rights_acceptance_fixed(
  p_user_id uuid,
  p_version text default '1.0 - MVP Launch',
  p_ip_address inet default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.record_rights_acceptance_v2(p_user_id, p_version, p_ip_address);
end;
$$;

-- Grant permissions to the wrapper
GRANT EXECUTE ON FUNCTION public.record_rights_acceptance_fixed TO authenticated, service_role;