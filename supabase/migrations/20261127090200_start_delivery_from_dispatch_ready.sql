create or replace function public.start_assigned_delivery(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path=public,private as $$
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 update public.orders o set status='out_for_delivery',updated_at=now()
 where o.id=p_order_id and o.status='ready_for_dispatch'
 and exists(select 1 from public.order_assignments a where a.order_id=o.id and a.delivery_partner_id=auth.uid());
 if not found then raise exception 'This order is not assigned to you or is not ready for dispatch'; end if;
 return jsonb_build_object('success',true,'order_id',p_order_id,'status','out_for_delivery');
end $$;
revoke all on function public.start_assigned_delivery(uuid) from public,anon;
grant execute on function public.start_assigned_delivery(uuid) to authenticated;