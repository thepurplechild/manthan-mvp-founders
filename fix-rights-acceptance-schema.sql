-- Fix Creator Rights Acceptance Schema
-- Add unique constraint that the RPC function expects

-- Add unique constraint on user_id (users should only accept once)
ALTER TABLE public.creator_rights_acceptances
ADD CONSTRAINT creator_rights_acceptances_user_id_unique
UNIQUE (user_id);

-- Drop existing function(s) to avoid conflicts - try all possible signatures
DROP FUNCTION IF EXISTS public.record_rights_acceptance CASCADE;
DROP FUNCTION IF EXISTS record_rights_acceptance CASCADE;

-- Update the RPC function to handle the constraint properly
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