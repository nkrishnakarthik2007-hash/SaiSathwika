-- Daily stock movement history and safe stock receiving for Sai Sathwika.
create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  movement_type text not null check (movement_type in ('stock_in','stock_out','adjustment')),
  quantity_change integer not null check (quantity_change <> 0),
  quantity_before integer not null check (quantity_before >= 0),
  quantity_after integer not null check (quantity_after >= 0),
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists inventory_movements_created_idx on public.inventory_movements(created_at desc);
create index if not exists inventory_movements_product_idx on public.inventory_movements(product_id,created_at desc);
alter table public.inventory_movements enable row level security;
grant select on public.inventory_movements to authenticated;
drop policy if exists "Admins read inventory movements" on public.inventory_movements;
create policy "Admins read inventory movements" on public.inventory_movements
  for select to authenticated using (public.is_admin());

create or replace function public.log_product_stock_movement()
returns trigger language plpgsql security definer set search_path=public
as $$
declare
  v_delta integer;
  v_type text;
  v_note text;
begin
  if new.stock_quantity is not distinct from old.stock_quantity then return new; end if;
  v_delta := new.stock_quantity-old.stock_quantity;
  v_type := case when v_delta>0 then 'stock_in' else 'stock_out' end;
  v_note := nullif(current_setting('app.inventory_note',true),'');
  if v_note is null and v_delta<0 and exists (
    select 1 from public.order_items oi join public.orders o on o.id=oi.order_id
    where oi.product_id=new.id and o.created_at=transaction_timestamp()
  ) then v_note := 'Customer order sale'; end if;
  insert into public.inventory_movements(product_id,movement_type,quantity_change,quantity_before,quantity_after,note,created_by)
  values(new.id,v_type,v_delta,old.stock_quantity,new.stock_quantity,coalesce(v_note,case when v_delta>0 then 'Stock added or corrected' else 'Stock reduced or corrected' end),auth.uid());
  return new;
end;
$$;
drop trigger if exists products_stock_movement_log on public.products;
create trigger products_stock_movement_log
after update of stock_quantity on public.products
for each row execute function public.log_product_stock_movement();

create or replace function public.receive_product_stock(p_product_id uuid,p_quantity integer,p_note text default null)
returns integer language plpgsql security invoker set search_path=public
as $$
declare v_new_stock integer;
begin
  if not public.is_admin() then raise exception 'Only store admins can receive stock'; end if;
  if p_quantity is null or p_quantity<1 or p_quantity>100000 then raise exception 'Enter a stock quantity between 1 and 100000'; end if;
  perform set_config('app.inventory_note',coalesce(nullif(trim(p_note),''),'New stock received'),true);
  update public.products set stock_quantity=stock_quantity+p_quantity,is_available=true,updated_at=now()
    where id=p_product_id returning stock_quantity into v_new_stock;
  if not found then raise exception 'Product not found'; end if;
  return v_new_stock;
end;
$$;
revoke all on function public.receive_product_stock(uuid,integer,text) from public,anon;
revoke all on function public.log_product_stock_movement() from public,anon,authenticated;
grant execute on function public.receive_product_stock(uuid,integer,text) to authenticated;
