-- Secure checkout: the browser sends product IDs and quantities only.
-- The database calculates prices, totals, stock and delivery eligibility.
create or replace function public.place_order(
  p_items jsonb,
  p_address_id uuid,
  p_customer_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $function$
declare
  v_user_id uuid := auth.uid();
  v_address public.customer_addresses%rowtype;
  v_settings public.store_settings%rowtype;
  v_product public.products%rowtype;
  v_item jsonb;
  v_product_id uuid;
  v_quantity integer;
  v_subtotal numeric(10,2) := 0;
  v_delivery_fee numeric(10,2);
  v_total numeric(10,2);
  v_line_total numeric(10,2);
  v_order_id uuid;
  v_order_number bigint;
  v_distance numeric;
begin
  if v_user_id is null then
    raise exception 'Please sign in before placing an order';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Your cart is empty';
  end if;
  if jsonb_array_length(p_items) > 50 then
    raise exception 'Too many different products in one order';
  end if;

  select * into v_settings from public.store_settings where id = 1;
  if not found or not v_settings.accepting_orders then
    raise exception 'The store is not accepting orders right now';
  end if;
  if v_settings.store_latitude is null or v_settings.store_longitude is null then
    raise exception 'The store delivery location has not been configured yet';
  end if;

  select * into v_address from public.customer_addresses
  where id = p_address_id and customer_id = v_user_id;
  if not found then
    raise exception 'Please choose one of your saved delivery addresses';
  end if;

  v_distance := 6371 * 2 * asin(sqrt(
    power(sin(radians(v_address.latitude - v_settings.store_latitude) / 2), 2) +
    cos(radians(v_settings.store_latitude)) * cos(radians(v_address.latitude)) *
    power(sin(radians(v_address.longitude - v_settings.store_longitude) / 2), 2)
  ));
  if v_distance > v_settings.delivery_radius_km then
    raise exception 'This address is outside our delivery area';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    begin
      v_product_id := (v_item->>'product_id')::uuid;
      v_quantity := (v_item->>'quantity')::integer;
    exception when others then
      raise exception 'Cart contains an invalid product or quantity';
    end;
    if v_quantity < 1 or v_quantity > 50 then
      raise exception 'Product quantity must be between 1 and 50';
    end if;

    select * into v_product from public.products where id = v_product_id for update;
    if not found or not v_product.is_available then
      raise exception 'A product in your cart is no longer available';
    end if;
    if v_product.stock_quantity < v_quantity then
      raise exception 'Not enough stock for %', v_product.name;
    end if;
    v_line_total := v_product.price * v_quantity;
    v_subtotal := v_subtotal + v_line_total;
  end loop;

  v_delivery_fee := case when v_settings.free_delivery then 0 else v_settings.delivery_fee end;
  v_total := v_subtotal + v_delivery_fee;

  insert into public.orders(
    customer_id, address_id, status, payment_method, payment_status,
    subtotal, delivery_fee, discount, total, delivery_address_snapshot, customer_note
  ) values (
    v_user_id, p_address_id, 'placed', 'cash_on_delivery', 'pending',
    v_subtotal, v_delivery_fee, 0, v_total,
    jsonb_build_object(
      'recipient_name',v_address.recipient_name,'phone',v_address.phone,
      'address_line',v_address.address_line,'landmark',v_address.landmark,
      'latitude',v_address.latitude,'longitude',v_address.longitude
    ),
    nullif(trim(coalesce(p_customer_note,'')), '')
  ) returning id, order_number into v_order_id, v_order_number;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity := (v_item->>'quantity')::integer;
    select * into v_product from public.products where id = v_product_id;
    v_line_total := v_product.price * v_quantity;

    insert into public.order_items(
      order_id, product_id, product_name_snapshot, brand_name_snapshot,
      variant_snapshot, unit_price, quantity, line_total
    ) values (
      v_order_id, v_product.id, v_product.name,
      (select b.name from public.brands b where b.id = v_product.brand_id),
      v_product.variant_label, v_product.price, v_quantity, v_line_total
    );

    update public.products
    set stock_quantity = stock_quantity - v_quantity,
        is_available = (stock_quantity - v_quantity) > 0,
        updated_at = now()
    where id = v_product_id;
  end loop;

  return jsonb_build_object(
    'order_id',v_order_id,'order_number',v_order_number,
    'subtotal',v_subtotal,'delivery_fee',v_delivery_fee,'total',v_total,
    'distance_km',round(v_distance::numeric,2)
  );
end;
$function$;

revoke all on function public.place_order(jsonb, uuid, text) from public, anon;
grant execute on function public.place_order(jsonb, uuid, text) to authenticated;
