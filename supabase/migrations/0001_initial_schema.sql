-- Sai Sathwika initial schema
-- Apply only to the dedicated sai-sathwika-commerce Supabase project.
-- Never apply to NKKAMS or student-attendance.

create extension if not exists pgcrypto;

create type public.app_role as enum ('customer','admin','super_admin','staff','delivery_staff');
create type public.order_status as enum ('placed','confirmed','preparing','out_for_delivery','delivered','cancelled');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  phone text,
  role public.app_role not null default 'customer',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.brands (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  logo_url text,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  image_url text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references public.brands(id) on delete set null,
  category_id uuid references public.categories(id) on delete set null,
  name text not null,
  description text,
  sku text unique,
  image_urls text[] not null default '{}',
  variant_label text,
  unit text,
  price numeric(10,2) not null check (price >= 0),
  mrp numeric(10,2) check (mrp is null or mrp >= price),
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  is_available boolean not null default true,
  is_featured boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  label text,
  recipient_name text not null,
  phone text not null,
  address_line text not null,
  landmark text,
  latitude double precision not null,
  longitude double precision not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.store_settings (
  id integer primary key default 1 check (id = 1),
  store_name text not null default 'Sai Sathwika',
  store_address text,
  store_latitude double precision,
  store_longitude double precision,
  delivery_radius_km numeric(6,2) not null default 2.00 check (delivery_radius_km > 0),
  free_delivery boolean not null default true,
  delivery_fee numeric(10,2) not null default 0 check (delivery_fee >= 0),
  accepting_orders boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.store_settings(id) values (1) on conflict (id) do nothing;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number bigint generated always as identity unique,
  customer_id uuid not null references public.profiles(id),
  address_id uuid references public.customer_addresses(id) on delete set null,
  status public.order_status not null default 'placed',
  payment_method text not null default 'cash_on_delivery' check (payment_method in ('cash_on_delivery','online')),
  payment_status text not null default 'pending' check (payment_status in ('pending','paid','failed','refunded')),
  subtotal numeric(10,2) not null check (subtotal >= 0),
  delivery_fee numeric(10,2) not null default 0 check (delivery_fee >= 0),
  discount numeric(10,2) not null default 0 check (discount >= 0),
  total numeric(10,2) not null check (total >= 0),
  delivery_address_snapshot jsonb not null,
  customer_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name_snapshot text not null,
  brand_name_snapshot text,
  variant_snapshot text,
  unit_price numeric(10,2) not null check (unit_price >= 0),
  quantity integer not null check (quantity > 0),
  line_total numeric(10,2) not null check (line_total >= 0)
);

create table public.promotions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  promotion_type text not null check (promotion_type in ('percentage','fixed_amount','buy_x_get_y','free_delivery','bundle')),
  rules jsonb not null default '{}'::jsonb,
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);

create index products_category_idx on public.products(category_id);
create index products_brand_idx on public.products(brand_id);
create index products_available_idx on public.products(is_available) where is_available = true;
create index addresses_customer_idx on public.customer_addresses(customer_id);
create index orders_customer_idx on public.orders(customer_id, created_at desc);
create index order_items_order_idx on public.order_items(order_id);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin','super_admin') and is_active = true
  );
$$;

create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'super_admin' and is_active = true
  );
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles(id, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url'
  ) on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.brands enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.customer_addresses enable row level security;
alter table public.store_settings enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.promotions enable row level security;

create policy "Users read own profile" on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
create policy "Users update own basic profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid() and role = (select p.role from public.profiles p where p.id = auth.uid()));
create policy "Admins manage profiles" on public.profiles for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "Public read active brands" on public.brands for select to anon, authenticated using (is_active or public.is_admin());
create policy "Admins manage brands" on public.brands for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Public read active categories" on public.categories for select to anon, authenticated using (is_active or public.is_admin());
create policy "Admins manage categories" on public.categories for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Public read available products" on public.products for select to anon, authenticated using ((is_available and stock_quantity > 0) or public.is_admin());
create policy "Admins manage products" on public.products for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "Customers manage own addresses" on public.customer_addresses for all to authenticated using (customer_id = auth.uid() or public.is_admin()) with check (customer_id = auth.uid() or public.is_admin());
create policy "Public read store settings" on public.store_settings for select to anon, authenticated using (true);
create policy "Admins update store settings" on public.store_settings for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "Customers read own orders" on public.orders for select to authenticated using (customer_id = auth.uid() or public.is_admin());
create policy "Admins update orders" on public.orders for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Customers read own order items" on public.order_items for select to authenticated using (
  exists (select 1 from public.orders o where o.id = order_id and (o.customer_id = auth.uid() or public.is_admin()))
);
create policy "Admins manage order items" on public.order_items for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "Public read active promotions" on public.promotions for select to anon, authenticated using ((is_active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at >= now())) or public.is_admin());
create policy "Admins manage promotions" on public.promotions for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Intentionally no public INSERT policy for orders/order_items.
-- Checkout must be implemented server-side so price, stock, order totals and delivery radius are verified.
-- First Super Admin must be assigned manually after the owner's first Google sign-in:
-- update public.profiles set role = 'super_admin' where id = '<AUTH USER UUID>';
