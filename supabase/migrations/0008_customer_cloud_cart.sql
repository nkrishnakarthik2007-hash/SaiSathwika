create table if not exists public.cart_items (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  quantity integer not null check (quantity between 1 and 50),
  updated_at timestamptz not null default now(),
  unique (customer_id, product_id)
);

create index if not exists cart_items_customer_updated_idx
  on public.cart_items (customer_id, updated_at desc);

alter table public.cart_items enable row level security;
grant select, insert, update, delete on public.cart_items to authenticated;

drop policy if exists "Customers read own cart items" on public.cart_items;
create policy "Customers read own cart items"
  on public.cart_items for select to authenticated
  using (customer_id = auth.uid());

drop policy if exists "Customers add own cart items" on public.cart_items;
create policy "Customers add own cart items"
  on public.cart_items for insert to authenticated
  with check (customer_id = auth.uid());

drop policy if exists "Customers update own cart items" on public.cart_items;
create policy "Customers update own cart items"
  on public.cart_items for update to authenticated
  using (customer_id = auth.uid())
  with check (customer_id = auth.uid());

drop policy if exists "Customers delete own cart items" on public.cart_items;
create policy "Customers delete own cart items"
  on public.cart_items for delete to authenticated
  using (customer_id = auth.uid());
