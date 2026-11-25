create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated;
alter function public.is_admin() set schema private;
alter function public.is_super_admin() set schema private;
alter function public.handle_new_user() set schema private;
revoke all on function private.handle_new_user() from public, anon, authenticated;
revoke all on function private.is_admin() from public;
revoke all on function private.is_super_admin() from public;
grant execute on function private.is_admin() to anon, authenticated;
grant execute on function private.is_super_admin() to authenticated;

drop policy if exists "Admins read profiles" on public.profiles;
drop policy if exists "Super admins manage profiles" on public.profiles;
create policy "Admins read profiles" on public.profiles for select to authenticated using (private.is_admin());
create policy "Super admins manage profiles" on public.profiles for all to authenticated using (private.is_super_admin()) with check (private.is_super_admin());

drop policy if exists "Admins manage brands" on public.brands;
create policy "Admins manage brands" on public.brands for all to authenticated using (private.is_admin()) with check (private.is_admin());
drop policy if exists "Admins manage categories" on public.categories;
create policy "Admins manage categories" on public.categories for all to authenticated using (private.is_admin()) with check (private.is_admin());
drop policy if exists "Admins manage products" on public.products;
create policy "Admins manage products" on public.products for all to authenticated using (private.is_admin()) with check (private.is_admin());
drop policy if exists "Customers manage own addresses" on public.customer_addresses;
create policy "Customers manage own addresses" on public.customer_addresses for all to authenticated using (customer_id = auth.uid() or private.is_admin()) with check (customer_id = auth.uid() or private.is_admin());
drop policy if exists "Admins update store settings" on public.store_settings;
create policy "Admins update store settings" on public.store_settings for update to authenticated using (private.is_admin()) with check (private.is_admin());
drop policy if exists "Customers read own orders" on public.orders;
create policy "Customers read own orders" on public.orders for select to authenticated using (customer_id = auth.uid() or private.is_admin());
drop policy if exists "Admins update orders" on public.orders;
create policy "Admins update orders" on public.orders for update to authenticated using (private.is_admin()) with check (private.is_admin());
drop policy if exists "Customers read own order items" on public.order_items;
create policy "Customers read own order items" on public.order_items for select to authenticated using (
  exists (select 1 from public.orders o where o.id = order_id and (o.customer_id = auth.uid() or private.is_admin()))
);
drop policy if exists "Admins manage order items" on public.order_items;
create policy "Admins manage order items" on public.order_items for all to authenticated using (private.is_admin()) with check (private.is_admin());
drop policy if exists "Public read active promotions" on public.promotions;
create policy "Public read active promotions" on public.promotions for select to anon, authenticated using ((is_active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at >= now())) or private.is_admin());
drop policy if exists "Admins manage promotions" on public.promotions;
create policy "Admins manage promotions" on public.promotions for all to authenticated using (private.is_admin()) with check (private.is_admin());

drop policy if exists "Admins upload product images" on storage.objects;
create policy "Admins upload product images" on storage.objects for insert to authenticated with check (bucket_id = 'product-images' and private.is_admin());
drop policy if exists "Admins update product images" on storage.objects;
create policy "Admins update product images" on storage.objects for update to authenticated using (bucket_id = 'product-images' and private.is_admin()) with check (bucket_id = 'product-images' and private.is_admin());
drop policy if exists "Admins delete product images" on storage.objects;
create policy "Admins delete product images" on storage.objects for delete to authenticated using (bucket_id = 'product-images' and private.is_admin());
