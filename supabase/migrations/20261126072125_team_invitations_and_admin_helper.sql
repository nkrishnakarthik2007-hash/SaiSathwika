create table if not exists public.team_invitations(id uuid primary key default gen_random_uuid(),email text not null,role public.app_role not null check(role in ('admin','owner')),invited_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),expires_at timestamptz not null default(now()+interval '7 days'),accepted_at timestamptz,revoked_at timestamptz,constraint team_invitations_email_lower check(email=lower(btrim(email))));
create index if not exists team_invitations_email_pending_idx on public.team_invitations(email,expires_at) where accepted_at is null and revoked_at is null;
alter table public.team_invitations enable row level security;
revoke all on public.team_invitations from anon,authenticated;
create or replace function private.is_admin() returns boolean language sql stable security definer set search_path=public as $function$ select exists(select 1 from public.profiles where id=auth.uid() and role in ('admin','owner','super_admin') and is_active=true); $function$;
revoke all on function private.is_admin() from public;
grant execute on function private.is_admin() to anon,authenticated;