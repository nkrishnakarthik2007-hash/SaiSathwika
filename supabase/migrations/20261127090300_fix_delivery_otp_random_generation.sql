create or replace function public.customer_get_delivery_otp(p_order_id uuid)
returns text language plpgsql security definer set search_path=public,extensions as $$
declare v_otp text; v_order public.orders%rowtype; v_bytes bytea; v_number bigint;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 select * into v_order from public.orders where id=p_order_id and customer_id=auth.uid() for update;
 if not found then raise exception 'Order not found'; end if;
 if v_order.status<>'out_for_delivery' then raise exception 'OTP is available only while the order is out for delivery'; end if;
 v_bytes:=gen_random_bytes(4);
 v_number:=get_byte(v_bytes,0)::bigint*16777216 + get_byte(v_bytes,1)::bigint*65536 + get_byte(v_bytes,2)::bigint*256 + get_byte(v_bytes,3)::bigint;
 v_otp:=lpad((v_number % 1000000)::text,6,'0');
 insert into public.delivery_order_otps(order_id,otp_hash,expires_at) values(p_order_id,encode(digest(v_otp||':'||p_order_id::text,'sha256'),'hex'),now()+interval '10 minutes')
 on conflict(order_id) do update set otp_hash=excluded.otp_hash,expires_at=excluded.expires_at,attempts=0,locked_until=null,issued_at=now(),verified_at=null;
 return v_otp;
end $$;
revoke all on function public.customer_get_delivery_otp(uuid) from public,anon;
grant execute on function public.customer_get_delivery_otp(uuid) to authenticated;