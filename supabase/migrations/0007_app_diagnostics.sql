create table if not exists public.app_diagnostics (
  id bigint generated always as identity primary key,
  received_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,
  app_version text,
  platform text not null default 'unknown',
  level text not null default 'error' check (level in ('error', 'warning')),
  message text not null,
  stack text
);

create index if not exists app_diagnostics_received_at_idx
  on public.app_diagnostics (received_at desc);

create index if not exists app_diagnostics_user_received_idx
  on public.app_diagnostics (user_id, received_at desc);

alter table public.app_diagnostics enable row level security;
grant insert, select on public.app_diagnostics to authenticated;
grant usage, select on sequence public.app_diagnostics_id_seq to authenticated;

drop policy if exists "Authenticated users submit own diagnostics" on public.app_diagnostics;
create policy "Authenticated users submit own diagnostics"
  on public.app_diagnostics
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Super admins read app diagnostics" on public.app_diagnostics;
create policy "Super admins read app diagnostics"
  on public.app_diagnostics
  for select to authenticated
  using (private.is_super_admin());
