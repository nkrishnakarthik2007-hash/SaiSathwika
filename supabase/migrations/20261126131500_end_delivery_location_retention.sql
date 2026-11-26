create or replace function private.customer_can_track_order(p_order_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.orders where id=p_order_id and customer_id=auth.uid() and status='out_for_delivery');
$$;
revoke all on function private.customer_can_track_order(uuid) from public,anon;
grant execute on function private.customer_can_track_order(uuid) to authenticated;

drop policy if exists "Customers read their delivery locations" on public.delivery_locations;
create policy "Customers read active delivery locations" on public.delivery_locations
  for select to authenticated using (private.customer_can_track_order(order_id));

create or replace function public.complete_assigned_delivery(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path=public,private as $$
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  update public.orders o set status='delivered',updated_at=now()
  where o.id=p_order_id and o.status='out_for_delivery'
    and exists(select 1 from public.order_assignments a where a.order_id=o.id and a.delivery_partner_id=auth.uid());
  if not found then raise exception 'This delivery is not assigned to you or is no longer active'; end if;
  delete from public.delivery_locations where order_id=p_order_id;
  return jsonb_build_object('success',true,'order_id',p_order_id,'status','delivered');
end; $$;
revoke all on function public.complete_assigned_delivery(uuid) from public,anon;
grant execute on function public.complete_assigned_delivery(uuid) to authenticated;

create or replace function private.log_order_status_change()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.status is distinct from old.status then
    insert into public.order_status_events(order_id,old_status,new_status,changed_by)
    values(new.id,old.status,new.status,auth.uid());
    if new.status in ('delivered','cancelled') then
      delete from public.delivery_locations where order_id=new.id;
    end if;
  end if;
  return new;
end; $$;
