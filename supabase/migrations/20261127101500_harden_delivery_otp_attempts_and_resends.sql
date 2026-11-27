-- Persist failed OTP attempts and enforce resend cooldowns.
alter table public.delivery_order_otps
  add column if not exists resend_window_started_at timestamptz not null default now(),
  add column if not exists resend_count integer not null default 0;

create or replace function public.customer_get_delivery_otp(p_order_id uuid)
returns text language plpgsql security definer set search_path = public, extensions
as $function$
declare
  v_otp text;
  v_order public.orders%rowtype;
  v_existing public.delivery_order_otps%rowtype;
  v_bytes bytea;
  v_number bigint;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  select * into v_order from public.orders where id=p_order_id and customer_id=auth.uid() for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.status <> 'out_for_delivery' then raise exception 'OTP is available only while the order is out for delivery'; end if;
  select * into v_existing from public.delivery_order_otps where order_id=p_order_id for update;
  if found and v_existing.verified_at is not null then raise exception 'This delivery OTP has already been used'; end if;
  if found and v_existing.issued_at > now()-interval '30 seconds' then raise exception 'Please wait 30 seconds before requesting another OTP'; end if;
  if found and v_existing.resend_window_started_at > now()-interval '10 minutes' and v_existing.resend_count >= 3 then
    raise exception 'OTP resend limit reached. Try again after 10 minutes';
  end if;
  v_bytes:=gen_random_bytes(4);
  v_number:=get_byte(v_bytes,0)::bigint*16777216+get_byte(v_bytes,1)::bigint*65536+get_byte(v_bytes,2)::bigint*256+get_byte(v_bytes,3)::bigint;
  v_otp:=lpad((v_number%1000000)::text,6,'0');
  insert into public.delivery_order_otps(order_id,otp_hash,expires_at,attempts,locked_until,issued_at,verified_at,resend_window_started_at,resend_count)
  values(p_order_id,encode(digest(v_otp||':'||p_order_id::text,'sha256'),'hex'),now()+interval '10 minutes',0,null,now(),null,now(),0)
  on conflict(order_id) do update set
    otp_hash=excluded.otp_hash,expires_at=excluded.expires_at,attempts=0,locked_until=null,issued_at=now(),verified_at=null,
    resend_window_started_at=case when public.delivery_order_otps.resend_window_started_at<=now()-interval '10 minutes' then now() else public.delivery_order_otps.resend_window_started_at end,
    resend_count=case when public.delivery_order_otps.resend_window_started_at<=now()-interval '10 minutes' then 1 else public.delivery_order_otps.resend_count+1 end;
  return v_otp;
end $function$;

create or replace function public.verify_delivery_otp(p_order_id uuid,p_otp text)
returns jsonb language plpgsql security definer set search_path=public,private
as $function$
declare v public.delivery_order_otps%rowtype; v_attempts integer;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if not exists(select 1 from public.profiles where id=auth.uid() and role='delivery_staff' and is_active) then raise exception 'Only an active delivery partner can verify this OTP'; end if;
  if not exists(select 1 from public.orders o join public.order_assignments a on a.order_id=o.id where o.id=p_order_id and o.status='out_for_delivery' and a.delivery_partner_id=auth.uid() for update of o) then raise exception 'This active delivery is not assigned to you'; end if;
  select * into v from public.delivery_order_otps where order_id=p_order_id for update;
  if not found then raise exception 'Ask the customer to generate the delivery OTP'; end if;
  if v.verified_at is not null then raise exception 'This OTP has already been used'; end if;
  if v.locked_until>now() then raise exception 'Too many incorrect attempts. Try again after five minutes'; end if;
  if v.expires_at<=now() then raise exception 'OTP expired. Ask the customer to generate a new one'; end if;
  if coalesce(p_otp,'') !~ '^[0-9]{6}$' or encode(digest(coalesce(p_otp,'')||':'||p_order_id::text,'sha256'),'hex')<>v.otp_hash then
    update public.delivery_order_otps set attempts=attempts+1,locked_until=case when attempts+1>=5 then now()+interval '5 minutes' else null end where order_id=p_order_id returning attempts into v_attempts;
    return jsonb_build_object('success',false,'message',case when v_attempts>=5 then 'Too many incorrect attempts. Verification is locked for five minutes.' else 'Incorrect OTP. Check the six-digit code with the customer.' end,'attempts_remaining',greatest(0,5-v_attempts));
  end if;
  update public.delivery_order_otps set verified_at=now() where order_id=p_order_id;
  update public.orders set status='delivered',updated_at=now() where id=p_order_id and status='out_for_delivery';
  return jsonb_build_object('success',true,'order_id',p_order_id,'status','delivered');
end $function$;

revoke all on function public.customer_get_delivery_otp(uuid) from public,anon;
revoke all on function public.verify_delivery_otp(uuid,text) from public,anon;
grant execute on function public.customer_get_delivery_otp(uuid) to authenticated;
grant execute on function public.verify_delivery_otp(uuid,text) to authenticated;
