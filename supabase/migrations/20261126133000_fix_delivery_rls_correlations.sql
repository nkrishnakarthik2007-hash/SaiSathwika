drop policy if exists "Delivery partners read assigned orders" on public.orders;
create policy "Delivery partners read assigned orders" on public.orders
  for select to authenticated using (
    exists (
      select 1 from public.order_assignments a
      where a.order_id = orders.id and a.delivery_partner_id = auth.uid()
    )
  );

drop policy if exists "Delivery partners read assigned order status events" on public.order_status_events;
create policy "Delivery partners read assigned order status events" on public.order_status_events
  for select to authenticated using (
    exists (
      select 1 from public.order_assignments a
      where a.order_id = order_status_events.order_id and a.delivery_partner_id = auth.uid()
    )
  );
