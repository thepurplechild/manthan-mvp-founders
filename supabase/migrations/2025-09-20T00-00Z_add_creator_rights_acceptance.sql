-- Creator Rights Acceptance Tracking

create table if not exists public.creator_rights_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  accepted_at timestamptz not null default now(),
  version text not null default '1.0 - MVP Launch',
  ip_address inet
);

alter table public.creator_rights_acceptances enable row level security;

-- Users may view their own acceptance record
create policy creator_rights_acceptances_select_self
  on public.creator_rights_acceptances
  for select
  to authenticated
  using (auth.uid() = user_id);

-- Service role performs inserts via RPC

create or replace function public.record_rights_acceptance(
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
  insert into public.creator_rights_acceptances (user_id, version, ip_address)
  values (p_user_id, coalesce(p_version, '1.0 - MVP Launch'), p_ip_address)
  on conflict (user_id) do nothing
  returning id into result;

  if result is null then
    select id into result
    from public.creator_rights_acceptances
    where user_id = p_user_id
    order by accepted_at desc
    limit 1;
  end if;

  return result;
end;
$$;
