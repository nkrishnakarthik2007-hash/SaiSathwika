-- Coupon codes and secure checkout discounts for Sai Sathwika.
alter table public.promotions
  add column if not exists coupon_code text,
  add column if not exists minimum_order_value numeric(10,2) not null default 0,
  add column if not exists maximum_discount numeric(10,2),
  add column if not exists usage_limit integer,
  add column if not exists usage_count integer not null default 0;

alter table public.orders
  add column if not exists coupon_code text,
  add column if not exists promotion_id uuid references public.promotions(id) on delete set null;

create unique index if not exists promotions_coupon_code_unique
  on public.promotions (upper(coupon_code)) where coupon_code is not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='promotions_minimum_order_nonnegative') then
    alter table public.promotions add constraint promotions_minimum_order_nonnegative check (minimum_order_value >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname='promotions_maximum_discount_positive') then
    alter table public.promotions add constraint promotions_maximum_discount_positive check (maximum_discount is null or maximum_discount > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname='promotions_usage_limit_positive') then
    alter table public.promotions add constraint promotions_usage_limit_positive check (usage_limit is null or usage_limit > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname='promotions_usage_count_nonnegative') then
    alter table public.promotions add constraint promotions_usage_count_nonnegative check (usage_count >= 0);
  end if;
end $$;

create or replace function public.validate_coupon(p_coupon_code text, p_subtotal numeric)
returns jsonb language plpgsql security definer set search_path to 'public','private'
as $function$
declare
  v_promotion public.promotions%rowtype;
  v_code text := nullif(upper(trim(coalesce(p_coupon_code,''))), '');
  v_discount numeric(10,2);
begin
  if auth.uid() is null then raise exception 'Please sign in to use a coupon'; end if;
  if v_code is null then raise exception 'Enter a coupon code'; end if;
  if p_subtotal is null or p_subtotal <= 0 then raise exception 'Your cart is empty'; end if;
  select * into v_promotion from public.promotions where upper(coupon_code)=v_code;
  if not found or not v_promotion.is_active
    or (v_promotion.starts_at is not null and v_promotion.starts_at > now())
    or (v_promotion.ends_at is not null and v_promotion.ends_at < now())
    or (v_promotion.usage_limit is not null and v_promotion.usage_count >= v_promotion.usage_limit)
  then raise exception 'This coupon is invalid, expired or no longer available'; end if;
  if p_subtotal < v_promotion.minimum_order_value then
    raise exception 'This coupon requires a minimum order of ₹%', to_char(v_promotion.minimum_order_value,'FM999999990.00');
  end if;
  if v_promotion.promotion_type='percentage' then
    v_discount:=round(p_subtotal*coalesce((v_promotion.rules->>'percentage')::numeric,0)/100,2);
  elsif v_promotion.promotion_type='fixed_amount' then
    v_discount:=coalesce((v_promotion.rules->>'amount')::numeric,0);
  else raise exception 'This offer type cannot be applied as a coupon yet';
  end if;
  if v_promotion.maximum_discount is not null then v_discount:=least(v_discount,v_promotion.maximum_discount); end if;
  v_discount:=least(greatest(v_discount,0),p_subtotal);
  if v_discount<=0 then raise exception 'This coupon does not provide a valid discount'; end if;
  return jsonb_build_object('coupon_code',v_code,'promotion_name',v_promotion.name,'discount',v_discount);
end;
$function$;

create or replace function public.place_order(
  p_items jsonb,p_address_id uuid,p_customer_note text default null,p_coupon_code text default null
)
returns jsonb language plpgsql security definer set search_path to 'public','private'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_address public.customer_addresses%rowtype;
  v_settings public.store_settings%rowtype;
  v_product public.products%rowtype;
  v_promotion public.promotions%rowtype;
  v_item jsonb;
  v_product_id uuid;
  v_quantity integer;
  v_subtotal numeric(10,2):=0;
  v_delivery_fee numeric(10,2);
  v_discount numeric(10,2):=0;
  v_total numeric(10,2);
  v_line_total numeric(10,2);
  v_order_id uuid;
  v_order_number bigint;
  v_distance numeric;
  v_coupon text:=nullif(upper(trim(coalesce(p_coupon_code,''))),'');
begin
  if v_user_id is null then raise exception 'Please sign in before placing an order'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Your cart is empty'; end if;
  if jsonb_array_length(p_items)>50 then raise exception 'Too many different products in one order'; end if;
  if exists(select 1 from (select value->>'product_id' product_id,count(*) item_count from jsonb_array_elements(p_items) group by value->>'product_id') duplicates where item_count>1)
    then raise exception 'Your cart contains a duplicate product'; end if;
  select * into v_settings from public.store_settings where id=1;
  if not found or not v_settings.accepting_orders then raise exception 'The store is not accepting orders right now'; end if;
  if v_settings.store_latitude is null or v_settings.store_longitude is null then raise exception 'The store delivery location has not been configured yet'; end if;
  select * into v_address from public.customer_addresses where id=p_address_id and customer_id=v_user_id;
  if not found then raise exception 'Please choose one of your saved delivery addresses'; end if;
  v_distance:=6371*2*asin(sqrt(
    power(sin(radians(v_address.latitude-v_settings.store_latitude)/2),2)+
    cos(radians(v_settings.store_latitude))*cos(radians(v_address.latitude))*
    power(sin(radians(v_address.longitude-v_settings.store_longitude)/2),2)));
  if v_distance>v_settings.delivery_radius_km then raise exception 'This address is outside our delivery area'; end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    begin v_product_id:=(v_item->>'product_id')::uuid;v_quantity:=(v_item->>'quantity')::integer;
    exception when others then raise exception 'Cart contains an invalid product or quantity'; end;
    if v_quantity<1 or v_quantity>50 then raise exception 'Product quantity must be between 1 and 50'; end if;
    select * into v_product from public.products where id=v_product_id for update;
    if not found or not v_product.is_available then raise exception 'A product in your cart is no longer available'; end if;
    if v_product.stock_quantity<v_quantity then raise exception 'Not enough stock for %',v_product.name; end if;
    v_subtotal:=v_subtotal+(v_product.price*v_quantity);
  end loop;
  if v_coupon is not null then
    select * into v_promotion from public.promotions where upper(coupon_code)=v_coupon for update;
    if not found or not v_promotion.is_active
      or (v_promotion.starts_at is not null and v_promotion.starts_at>now())
      or (v_promotion.ends_at is not null and v_promotion.ends_at<now())
      or (v_promotion.usage_limit is not null and v_promotion.usage_count>=v_promotion.usage_limit)
      then raise exception 'This coupon is invalid, expired or no longer available'; end if;
    if v_subtotal<v_promotion.minimum_order_value then raise exception 'This coupon requires a minimum order of ₹%',to_char(v_promotion.minimum_order_value,'FM999999990.00'); end if;
    if v_promotion.promotion_type='percentage' then v_discount:=round(v_subtotal*coalesce((v_promotion.rules->>'percentage')::numeric,0)/100,2);
    elsif v_promotion.promotion_type='fixed_amount' then v_discount:=coalesce((v_promotion.rules->>'amount')::numeric,0);
    else raise exception 'This offer type cannot be applied as a coupon yet'; end if;
    if v_promotion.maximum_discount is not null then v_discount:=least(v_discount,v_promotion.maximum_discount); end if;
    v_discount:=least(greatest(v_discount,0),v_subtotal);
    if v_discount<=0 then raise exception 'This coupon does not provide a valid discount'; end if;
  end if;
  v_delivery_fee:=case when v_settings.free_delivery then 0 else v_settings.delivery_fee end;
  v_total:=greatest(0,v_subtotal-v_discount+v_delivery_fee);
  insert into public.orders(customer_id,address_id,status,payment_method,payment_status,subtotal,delivery_fee,discount,total,delivery_address_snapshot,customer_note,coupon_code,promotion_id)
  values(v_user_id,p_address_id,'placed','cash_on_delivery','pending',v_subtotal,v_delivery_fee,v_discount,v_total,
    jsonb_build_object('recipient_name',v_address.recipient_name,'phone',v_address.phone,'address_line',v_address.address_line,'landmark',v_address.landmark,'latitude',v_address.latitude,'longitude',v_address.longitude),
    nullif(trim(coalesce(p_customer_note,'')),''),v_coupon,case when v_coupon is not null then v_promotion.id else null end)
  returning id,order_number into v_order_id,v_order_number;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_product_id:=(v_item->>'product_id')::uuid;v_quantity:=(v_item->>'quantity')::integer;
    select * into v_product from public.products where id=v_product_id;
    v_line_total:=v_product.price*v_quantity;
    insert into public.order_items(order_id,product_id,product_name_snapshot,brand_name_snapshot,variant_snapshot,unit_price,quantity,line_total)
    values(v_order_id,v_product.id,v_product.name,(select b.name from public.brands b where b.id=v_product.brand_id),v_product.variant_label,v_product.price,v_quantity,v_line_total);
    update public.products set stock_quantity=stock_quantity-v_quantity,is_available=(stock_quantity-v_quantity)>0,updated_at=now() where id=v_product_id;
  end loop;
  if v_coupon is not null then update public.promotions set usage_count=usage_count+1 where id=v_promotion.id; end if;
  return jsonb_build_object('order_id',v_order_id,'order_number',v_order_number,'subtotal',v_subtotal,'delivery_fee',v_delivery_fee,'discount',v_discount,'coupon_code',v_coupon,'total',v_total,'distance_km',round(v_distance::numeric,2));
end;
$function$;

revoke all on function public.validate_coupon(text,numeric) from public;
grant execute on function public.validate_coupon(text,numeric) to authenticated;
revoke all on function public.place_order(jsonb,uuid,text,text) from public;
grant execute on function public.place_order(jsonb,uuid,text,text) to authenticated;
revoke execute on function public.place_order(jsonb,uuid,text) from public;
grant execute on function public.place_order(jsonb,uuid,text) to authenticated;
