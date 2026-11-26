-- Avoid recursive RLS evaluation when customers view delivery assignment/tracking.
create or replace function private.customer_owns_order(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.orders
    where id = p_order_id and customer_id = auth.uid()
  );
$$;
revoke all on function private.customer_owns_order(uuid) from public, anon;
grant execute on function private.customer_owns_order(uuid) to authenticated;

drop policy if exists "Customers read their order assignment" on public.order_assignments;
create policy "Customers read their order assignment" on public.order_assignments
  for select to authenticated using (private.customer_owns_order(order_id));

drop policy if exists "Customers read their delivery locations" on public.delivery_locations;
create policy "Customers read their delivery locations" on public.delivery_locations
  for select to authenticated using (private.customer_owns_order(order_id));

drop policy if exists "Customers read own order status events" on public.order_status_events;
create policy "Customers read own order status events" on public.order_status_events
  for select to authenticated using (private.customer_owns_order(order_id));

-- Keep only the latest GPS point per order, not a permanent route history.
create unique index if not exists delivery_locations_one_per_order_idx
  on public.delivery_locations(order_id);
create or replace function public.record_delivery_location(
  p_order_id uuid, p_latitude double precision, p_longitude double precision, p_accuracy_m double precision default null
)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if p_latitude is null or p_latitude not between -90 and 90
     or p_longitude is null or p_longitude not between -180 and 180 then
    raise exception 'Invalid GPS coordinates';
  end if;
  if p_accuracy_m is not null and p_accuracy_m < 0 then raise exception 'Invalid GPS accuracy'; end if;
  if not exists (
    select 1 from public.order_assignments a
    join public.orders o on o.id = a.order_id
    where a.order_id = p_order_id
      and a.delivery_partner_id = auth.uid()
      and o.status = 'out_for_delivery'
  ) then raise exception 'You can only share location for your active assigned delivery'; end if;
  insert into public.delivery_locations(order_id,delivery_partner_id,latitude,longitude,accuracy_m)
  values (p_order_id,auth.uid(),p_latitude,p_longitude,p_accuracy_m)
  on conflict (order_id) do update set
    delivery_partner_id=excluded.delivery_partner_id,
    latitude=excluded.latitude,
    longitude=excluded.longitude,
    accuracy_m=excluded.accuracy_m,
    recorded_at=now();
end;
$$;
revoke all on function public.record_delivery_location(uuid,double precision,double precision,double precision) from public, anon;
grant execute on function public.record_delivery_location(uuid,double precision,double precision,double precision) to authenticated;
