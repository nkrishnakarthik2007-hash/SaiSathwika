-- Secure delivery confirmation: customer-visible OTP and assigned-partner verification.
create table if not exists public.delivery_order_otps (
 order_id uuid primary key references public.orders(id) on delete cascade,
 otp_hash text not null, expires_at timestamptz not null,
 attempts integer not null default 0 check(attempts>=0), locked_until timestamptz,
 issued_at timestamptz not null default now(), verified_at timestamptz
);
alter table public.delivery_order_otps enable row level security;
revoke all on public.delivery_order_otps from public,anon,authenticated;
create or replace function public.customer_get_delivery_otp(p_order_id uuid)
returns text language plpgsql security definer set search_path=public,extensions as $$
declare v_otp text; v_order public.orders%rowtype; v_bytes bytea;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 select * into v_order from public.orders where id=p_order_id and customer_id=auth.uid() for update;
 if not found then raise exception 'Order not found'; end if;
 if v_order.status<>'out_for_delivery' then raise exception 'OTP is available only while the order is out for delivery'; end if;
 v_bytes:=gen_random_bytes(4);
 v_otp:=lpad((mod(('x'||encode(v_bytes,'hex'))::bit(32)::bigint,1000000))::text,6,'0');
 insert into public.delivery_order_otps(order_id,otp_hash,expires_at) values(p_order_id,encode(digest(v_otp||':'||p_order_id::text,'sha256'),'hex'),now()+interval '10 minutes')
 on conflict(order_id) do update set otp_hash=excluded.otp_hash,expires_at=excluded.expires_at,attempts=0,locked_until=null,issued_at=now(),verified_at=null;
 return v_otp;
end $$;
create or replace function public.verify_delivery_otp(p_order_id uuid,p_otp text)
returns jsonb language plpgsql security definer set search_path=public,private as $$
declare v public.delivery_order_otps%rowtype;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 if not exists(select 1 from public.profiles where id=auth.uid() and role='delivery_staff' and is_active) then raise exception 'Only an active delivery partner can verify this OTP'; end if;
 if not exists(select 1 from public.orders o join public.order_assignments a on a.order_id=o.id where o.id=p_order_id and o.status='out_for_delivery' and a.delivery_partner_id=auth.uid() for update of o) then raise exception 'This active delivery is not assigned to you'; end if;
 select * into v from public.delivery_order_otps where order_id=p_order_id for update;
 if not found then raise exception 'Ask the customer to generate the delivery OTP'; end if;
 if v.verified_at is not null then raise exception 'This OTP has already been used'; end if;
 if v.locked_until>now() then raise exception 'Too many incorrect attempts. Try again after five minutes'; end if;
 if v.expires_at<=now() then raise exception 'OTP expired. Ask the customer to generate a new one'; end if;
 if p_otp !~ '^[0-9]{6}$' or encode(digest(coalesce(p_otp,'')||':'||p_order_id::text,'sha256'),'hex')<>v.otp_hash then
   update public.delivery_order_otps set attempts=attempts+1,locked_until=case when attempts+1>=5 then now()+interval '5 minutes' else null end where order_id=p_order_id;
   raise exception 'Incorrect OTP. Check the six-digit code with the customer';
 end if;
 update public.delivery_order_otps set verified_at=now() where order_id=p_order_id;
 update public.orders set status='delivered',updated_at=now() where id=p_order_id and status='out_for_delivery';
 return jsonb_build_object('success',true,'order_id',p_order_id,'status','delivered');
end $$;
create or replace function public.complete_assigned_delivery(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path=public,private as $$
begin raise exception 'Delivery completion requires customer OTP verification'; end $$;
revoke all on function public.customer_get_delivery_otp(uuid) from public,anon;
grant execute on function public.customer_get_delivery_otp(uuid) to authenticated;
revoke all on function public.verify_delivery_otp(uuid,text) from public,anon;
grant execute on function public.verify_delivery_otp(uuid,text) to authenticated;
revoke all on function public.complete_assigned_delivery(uuid) from public,anon;
grant execute on function public.complete_assigned_delivery(uuid) to authenticated;
