-- Delivery foundations for the single-app, role-based delivery workflow.
-- Tracking is limited to an assigned order while it is out for delivery.

create table if not exists public.order_assignments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  delivery_partner_id uuid not null references public.profiles(id),
  assigned_by uuid not null references public.profiles(id),
  assigned_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists order_assignments_partner_idx on public.order_assignments(delivery_partner_id, assigned_at desc);

create table if not exists public.delivery_locations (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  delivery_partner_id uuid not null references public.profiles(id),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy_m double precision check (accuracy_m is null or accuracy_m >= 0),
  recorded_at timestamptz not null default now()
);
create index if not exists delivery_locations_order_latest_idx on public.delivery_locations(order_id, recorded_at desc);

create table if not exists public.order_status_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  old_status public.order_status,
  new_status public.order_status not null,
  changed_by uuid references public.profiles(id),
  changed_at timestamptz not null default now()
);
create index if not exists order_status_events_order_idx on public.order_status_events(order_id, changed_at desc);

alter table public.order_assignments enable row level security;
alter table public.delivery_locations enable row level security;
alter table public.order_status_events enable row level security;

create policy "Admins manage order assignments" on public.order_assignments for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy "Assigned partners read own assignments" on public.order_assignments for select to authenticated using (delivery_partner_id = auth.uid());
create policy "Customers read their order assignment" on public.order_assignments for select to authenticated using (exists (select 1 from public.orders o where o.id = order_id and o.customer_id = auth.uid()));

create policy "Admins read delivery locations" on public.delivery_locations for select to authenticated using (private.is_admin());
create policy "Assigned partners read delivery locations" on public.delivery_locations for select to authenticated using (delivery_partner_id = auth.uid());
create policy "Customers read their delivery locations" on public.delivery_locations for select to authenticated using (exists (select 1 from public.orders o where o.id = order_id and o.customer_id = auth.uid()));

create policy "Admins read order status events" on public.order_status_events for select to authenticated using (private.is_admin());
create policy "Customers read own order status events" on public.order_status_events for select to authenticated using (exists (select 1 from public.orders o where o.id = order_id and o.customer_id = auth.uid()));
create policy "Delivery partners read assigned order status events" on public.order_status_events for select to authenticated using (exists (select 1 from public.order_assignments a where a.order_id = order_id and a.delivery_partner_id = auth.uid()));

create policy "Delivery partners read assigned orders" on public.orders for select to authenticated using (exists (select 1 from public.order_assignments a where a.order_id = id and a.delivery_partner_id = auth.uid()));
create policy "Delivery partners read assigned order items" on public.order_items for select to authenticated using (exists (select 1 from public.order_assignments a where a.order_id = order_items.order_id and a.delivery_partner_id = auth.uid()));

create or replace function public.assign_delivery_partner(p_order_id uuid, p_delivery_partner_id uuid)
returns jsonb language plpgsql security definer set search_path = public, private as $$
declare v_order public.orders%rowtype; v_partner public.profiles%rowtype;
begin
  if auth.uid() is null or not private.is_admin() then raise exception 'Only an authorised shop administrator can assign deliveries'; end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.status not in ('confirmed','preparing','out_for_delivery') then raise exception 'This order cannot be assigned in its current status'; end if;
  select * into v_partner from public.profiles where id = p_delivery_partner_id and role = 'delivery_staff' and is_active = true;
  if not found then raise exception 'Choose an active delivery partner account'; end if;
  insert into public.order_assignments(order_id,delivery_partner_id,assigned_by) values (p_order_id,p_delivery_partner_id,auth.uid())
  on conflict (order_id) do update set delivery_partner_id=excluded.delivery_partner_id,assigned_by=excluded.assigned_by,assigned_at=now(),updated_at=now();
  return jsonb_build_object('success',true,'order_id',p_order_id,'delivery_partner_id',p_delivery_partner_id);
end; $$;

create or replace function public.record_delivery_location(p_order_id uuid,p_latitude double precision,p_longitude double precision,p_accuracy_m double precision default null)
returns void language plpgsql security definer set search_path = public, private as $$
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if p_latitude is null or p_latitude not between -90 and 90 or p_longitude is null or p_longitude not between -180 and 180 then raise exception 'Invalid GPS coordinates'; end if;
  if p_accuracy_m is not null and p_accuracy_m < 0 then raise exception 'Invalid GPS accuracy'; end if;
  if not exists (select 1 from public.order_assignments a join public.orders o on o.id=a.order_id where a.order_id=p_order_id and a.delivery_partner_id=auth.uid() and o.status='out_for_delivery') then
    raise exception 'You can only share location for your active assigned delivery';
  end if;
  insert into public.delivery_locations(order_id,delivery_partner_id,latitude,longitude,accuracy_m) values (p_order_id,auth.uid(),p_latitude,p_longitude,p_accuracy_m);
end; $$;

create or replace function public.complete_assigned_delivery(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = public, private as $$
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  update public.orders o set status='delivered',updated_at=now()
  where o.id=p_order_id and o.status='out_for_delivery'
    and exists (select 1 from public.order_assignments a where a.order_id=o.id and a.delivery_partner_id=auth.uid());
  if not found then raise exception 'This delivery is not assigned to you or is no longer active'; end if;
  return jsonb_build_object('success',true,'order_id',p_order_id,'status','delivered');
end; $$;

create or replace function private.log_order_status_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    insert into public.order_status_events(order_id,old_status,new_status,changed_by) values (new.id,old.status,new.status,auth.uid());
  end if;
  return new;
end; $$;
drop trigger if exists orders_log_status_change on public.orders;
create trigger orders_log_status_change after update of status on public.orders for each row execute function private.log_order_status_change();

revoke all on function public.assign_delivery_partner(uuid,uuid) from public,anon;
grant execute on function public.assign_delivery_partner(uuid,uuid) to authenticated;
revoke all on function public.record_delivery_location(uuid,double precision,double precision,double precision) from public,anon;
grant execute on function public.record_delivery_location(uuid,double precision,double precision,double precision) to authenticated;
revoke all on function public.complete_assigned_delivery(uuid) from public,anon;
grant execute on function public.complete_assigned_delivery(uuid) to authenticated;
revoke all on public.order_assignments,public.delivery_locations,public.order_status_events from anon,authenticated;
grant select on public.order_assignments,public.delivery_locations,public.order_status_events to authenticated;
grant insert on public.delivery_locations to authenticated;
