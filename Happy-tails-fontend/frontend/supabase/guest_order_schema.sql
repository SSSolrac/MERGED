-- =========================================================
-- GUEST ORDER CHECKOUT SUPPORT
-- Apply after unified_schema.sql and delivery_area_schema.sql on deployed databases.
-- =========================================================

drop function if exists public.create_customer_order(
  public.order_type,
  public.payment_method,
  numeric,
  numeric,
  numeric,
  numeric,
  jsonb,
  text,
  text,
  jsonb,
  timestamptz
);

drop function if exists public.create_customer_order(
  public.order_type,
  public.payment_method,
  numeric,
  numeric,
  numeric,
  numeric,
  jsonb,
  text,
  text,
  jsonb,
  timestamptz,
  text,
  text
);

create or replace function public.create_customer_order(
  p_order_type public.order_type,
  p_payment_method public.payment_method,
  p_subtotal numeric,
  p_discount_total numeric,
  p_delivery_fee numeric default 0,
  p_total_amount numeric default 0,
  p_items jsonb default '[]'::jsonb,
  p_receipt_image_url text default null,
  p_notes text default null,
  p_delivery_address jsonb default null,
  p_placed_at timestamptz default now(),
  p_guest_phone_normalized text default null,
  p_guest_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid := auth.uid();
  v_guest_phone text := nullif(regexp_replace(coalesce(p_guest_phone_normalized, ''), '\s+', '', 'g'), '');
  v_guest_email text := lower(nullif(trim(coalesce(p_guest_email, '')), ''));
  v_order public.orders%rowtype;
  v_item_count integer;
  v_inserted_item_count integer;
  v_payload_subtotal numeric(12,2);
  v_payload_discount_total numeric(12,2);
  v_payload_delivery_fee numeric(12,2);
  v_payload_total_amount numeric(12,2);
  v_computed_subtotal numeric(12,2);
  v_computed_discount_total numeric(12,2);
  v_computed_total_amount numeric(12,2);
  v_receipt_required boolean;
  v_resolved_items jsonb;
  v_validated_item_count integer;
  v_reward_item_ids uuid[];
  v_reward_item_count integer;
  v_claimed_reward_item_count integer;
  v_delivery_validation jsonb;
  v_delivery_payload jsonb;
begin
  if v_customer_id is null and v_guest_phone is null and v_guest_email is null then
    raise exception 'Guest checkout requires a phone or email.';
  end if;

  if p_payment_method is null then
    raise exception 'Payment method is required.';
  end if;

  v_receipt_required := p_payment_method <> 'cash';
  if v_receipt_required and nullif(trim(coalesce(p_receipt_image_url, '')), '') is null then
    raise exception 'Receipt upload is required for non-cash payments.';
  end if;

  v_item_count := coalesce(jsonb_array_length(p_items), 0);
  if v_item_count = 0 then
    raise exception 'At least one order item is required.';
  end if;

  v_payload_subtotal := round(coalesce(p_subtotal, 0)::numeric, 2);
  v_payload_discount_total := round(coalesce(p_discount_total, 0)::numeric, 2);
  v_payload_delivery_fee := round(coalesce(p_delivery_fee, 0)::numeric, 2);
  v_payload_total_amount := round(coalesce(p_total_amount, 0)::numeric, 2);

  if v_payload_subtotal < 0
    or v_payload_discount_total < 0
    or v_payload_delivery_fee < 0
    or v_payload_total_amount < 0
  then
    raise exception 'Order totals cannot be negative.';
  end if;

  if v_payload_discount_total > v_payload_subtotal then
    raise exception 'Discount total cannot exceed subtotal.';
  end if;

  if p_order_type = 'delivery' and v_payload_delivery_fee < 49 then
    raise exception 'Delivery fee is required for delivery orders.';
  elsif p_order_type <> 'delivery' and abs(v_payload_delivery_fee) > 0.01 then
    raise exception 'Delivery fee can only be applied to delivery orders.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_items) as x(
      menu_item_id uuid,
      loyalty_reward_item_id uuid,
      menu_item_code text,
      item_name text,
      unit_price numeric,
      discount_amount numeric,
      quantity integer,
      line_total numeric
    )
    where coalesce(trim(x.menu_item_code), '') = ''
      or coalesce(trim(x.item_name), '') = ''
      or coalesce(x.quantity, 0) <= 0
      or coalesce(x.unit_price, 0) < 0
      or coalesce(x.discount_amount, 0) < 0
      or coalesce(x.discount_amount, 0) > coalesce(x.unit_price, 0)
      or coalesce(x.line_total, 0) < 0
      or (x.loyalty_reward_item_id is not null and coalesce(x.quantity, 0) <> 1)
  ) then
    raise exception 'Each order item must include a valid menu item code, name, quantity, and non-negative amounts.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_items) as x(
      menu_item_id uuid,
      loyalty_reward_item_id uuid,
      menu_item_code text,
      item_name text,
      unit_price numeric,
      discount_amount numeric,
      quantity integer,
      line_total numeric
    )
    where x.loyalty_reward_item_id is not null
    group by x.loyalty_reward_item_id
    having count(*) > 1
  ) then
    raise exception 'Each loyalty reward item can only be used once per order.';
  end if;

  if v_customer_id is null and exists (
    select 1
    from jsonb_to_recordset(p_items) as x(loyalty_reward_item_id uuid)
    where x.loyalty_reward_item_id is not null
  ) then
    raise exception 'Create an account or log in before claiming loyalty rewards.';
  end if;

  with raw_items as (
    select
      row_number() over () as row_no,
      x.menu_item_id,
      x.loyalty_reward_item_id,
      nullif(trim(coalesce(x.menu_item_code, '')), '') as menu_item_code,
      nullif(trim(coalesce(x.item_name, '')), '') as item_name,
      greatest(coalesce(x.quantity, 1), 1)::integer as quantity
    from jsonb_to_recordset(p_items) as x(
      menu_item_id uuid,
      loyalty_reward_item_id uuid,
      menu_item_code text,
      item_name text,
      unit_price numeric,
      discount_amount numeric,
      quantity integer,
      line_total numeric
    )
  ),
  resolved_items as (
    select
      r.row_no,
      mi.id as menu_item_id,
      lri.id as loyalty_reward_item_id,
      mi.code as menu_item_code,
      mi.name as item_name,
      round(coalesce(mi.price, 0)::numeric, 2) as unit_price,
      round(
        case
          when lri.id is not null then coalesce(mi.price, 0)
          else coalesce(mi.effective_discount, 0)
        end::numeric,
        2
      ) as discount_amount,
      r.quantity,
      round(
        case
          when lri.id is not null then 0
          else greatest(
            coalesce(mi.price, 0) - coalesce(mi.effective_discount, 0),
            0
          )
        end::numeric * r.quantity,
        2
      ) as line_total
    from raw_items r
    join public.menu_item_effective_availability mi
      on (
        (r.menu_item_id is not null and mi.id = r.menu_item_id)
        or (r.menu_item_id is null and r.menu_item_code is not null and lower(mi.code) = lower(r.menu_item_code))
      )
      and (
        r.menu_item_id is not null
        or r.menu_item_code is null
        or lower(mi.code) = lower(r.menu_item_code)
      )
    left join public.loyalty_reward_items lri
      on lri.id = r.loyalty_reward_item_id
      and lri.customer_id = v_customer_id
      and lri.status = 'pending'
      and lri.claimed_order_id is null
      and lri.menu_item_id = mi.id
    where mi.effective_is_available = true
      and (r.loyalty_reward_item_id is null or lri.id is not null)
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'menu_item_id', ri.menu_item_id,
          'loyalty_reward_item_id', ri.loyalty_reward_item_id,
          'menu_item_code', ri.menu_item_code,
          'item_name', ri.item_name,
          'unit_price', ri.unit_price,
          'discount_amount', ri.discount_amount,
          'quantity', ri.quantity,
          'line_total', ri.line_total
        )
        order by ri.row_no
      ),
      '[]'::jsonb
    ),
    count(*)
  into
    v_resolved_items,
    v_validated_item_count
  from resolved_items ri;

  if v_validated_item_count <> v_item_count then
    raise exception 'Invalid order items payload.';
  end if;

  select
    round(
      coalesce(sum(coalesce(x.unit_price, 0) * greatest(coalesce(x.quantity, 1), 1)), 0)::numeric,
      2
    ),
    round(
      coalesce(sum(coalesce(x.discount_amount, 0) * greatest(coalesce(x.quantity, 1), 1)), 0)::numeric,
      2
    ),
    round(
      coalesce(
        sum(
          greatest(coalesce(x.unit_price, 0) - coalesce(x.discount_amount, 0), 0) * greatest(coalesce(x.quantity, 1), 1)
        ),
        0
      )::numeric + v_payload_delivery_fee,
      2
    )
  into
    v_computed_subtotal,
    v_computed_discount_total,
    v_computed_total_amount
  from jsonb_to_recordset(v_resolved_items) as x(
    menu_item_id uuid,
    loyalty_reward_item_id uuid,
    menu_item_code text,
    item_name text,
    unit_price numeric,
    discount_amount numeric,
    quantity integer,
    line_total numeric
  );

  if abs(v_computed_subtotal - v_payload_subtotal) > 0.01
    or abs(v_computed_discount_total - v_payload_discount_total) > 0.01
    or abs(v_computed_total_amount - v_payload_total_amount) > 0.01
  then
    raise exception 'Order totals do not match order items.';
  end if;

  v_delivery_payload := case
    when p_delivery_address is null then null
    when jsonb_typeof(p_delivery_address) = 'object' then p_delivery_address
    else null
  end;

  if p_order_type = 'delivery' then
    if v_delivery_payload is null then
      raise exception 'Delivery address is required for delivery orders.';
    end if;

    v_delivery_validation := public.validate_delivery_address(v_delivery_payload);
    v_delivery_payload := coalesce(v_delivery_payload, '{}'::jsonb) || jsonb_build_object(
      'address', v_delivery_validation ->> 'normalizedAddress',
      'normalizedAddress', v_delivery_validation ->> 'normalizedAddress',
      'deliveryAreaId', v_delivery_validation ->> 'deliveryAreaId',
      'selectedPurokId', v_delivery_validation ->> 'selectedPurokId',
      'selectedPurokName', v_delivery_validation ->> 'selectedPurokName',
      'fixedBarangayName', v_delivery_validation ->> 'fixedBarangayName',
      'city', v_delivery_validation ->> 'city',
      'province', v_delivery_validation ->> 'province',
      'country', v_delivery_validation ->> 'country',
      'latitude', (v_delivery_validation ->> 'latitude')::double precision,
      'longitude', (v_delivery_validation ->> 'longitude')::double precision,
      'deliveryFee', v_payload_delivery_fee
    );
  end if;

  if v_customer_id is null then
    v_delivery_payload := coalesce(v_delivery_payload, '{}'::jsonb) || jsonb_build_object(
      'guestPhoneNormalized', v_guest_phone,
      'guestEmail', v_guest_email
    );
  end if;

  insert into public.orders (
    customer_id,
    order_type,
    status,
    payment_method,
    payment_status,
    subtotal,
    discount_total,
    total_amount,
    receipt_image_url,
    notes,
    delivery_address,
    placed_at
  )
  values (
    v_customer_id,
    p_order_type,
    'pending',
    p_payment_method,
    'pending',
    v_computed_subtotal,
    v_computed_discount_total,
    v_computed_total_amount,
    nullif(trim(coalesce(p_receipt_image_url, '')), ''),
    p_notes,
    v_delivery_payload,
    coalesce(p_placed_at, now())
  )
  returning * into v_order;

  insert into public.order_items (
    order_id,
    menu_item_id,
    menu_item_code,
    item_name,
    unit_price,
    discount_amount,
    quantity,
    line_total
  )
  select
    v_order.id,
    menu_item_id,
    menu_item_code,
    item_name,
    coalesce(unit_price, 0),
    coalesce(discount_amount, 0),
    greatest(quantity, 1),
    greatest(coalesce(unit_price, 0) - coalesce(discount_amount, 0), 0) * greatest(quantity, 1)
  from jsonb_to_recordset(v_resolved_items) as x(
    menu_item_id uuid,
    loyalty_reward_item_id uuid,
    menu_item_code text,
    item_name text,
    unit_price numeric,
    discount_amount numeric,
    quantity integer,
    line_total numeric
  );
  get diagnostics v_inserted_item_count = row_count;

  if v_inserted_item_count <> v_item_count then
    raise exception 'Invalid order items payload.';
  end if;

  select
    coalesce(
      array_agg(x.loyalty_reward_item_id) filter (where x.loyalty_reward_item_id is not null),
      '{}'::uuid[]
    ),
    coalesce(count(*) filter (where x.loyalty_reward_item_id is not null), 0)
  into
    v_reward_item_ids,
    v_reward_item_count
  from jsonb_to_recordset(v_resolved_items) as x(
    menu_item_id uuid,
    loyalty_reward_item_id uuid,
    menu_item_code text,
    item_name text,
    unit_price numeric,
    discount_amount numeric,
    quantity integer,
    line_total numeric
  );

  if v_reward_item_count > 0 then
    v_claimed_reward_item_count := public.claim_loyalty_reward_items_for_order(
      v_order.id,
      v_reward_item_ids,
      coalesce(p_placed_at, now())
    );

    if coalesce(v_claimed_reward_item_count, 0) <> v_reward_item_count then
      raise exception 'Invalid loyalty reward items payload.';
    end if;
  end if;

  insert into public.order_status_history (
    order_id,
    status,
    changed_by,
    note,
    changed_at
  )
  values (
    v_order.id,
    'pending',
    v_customer_id,
    'Order placed',
    coalesce(p_placed_at, now())
  );

  return jsonb_build_object(
    'order', to_jsonb(v_order),
    'items', coalesce(
      (select jsonb_agg(to_jsonb(oi)) from public.order_items oi where oi.order_id = v_order.id),
      '[]'::jsonb
    ),
    'history', coalesce(
      (select jsonb_agg(to_jsonb(h) order by h.changed_at) from public.order_status_history h where h.order_id = v_order.id),
      '[]'::jsonb
    )
  );
end;
$$;

create or replace function public.get_guest_order_for_tracking(
  p_order_ref text,
  p_guest_phone_normalized text default null,
  p_guest_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_ref text := nullif(trim(coalesce(p_order_ref, '')), '');
  v_guest_phone text := nullif(regexp_replace(coalesce(p_guest_phone_normalized, ''), '\s+', '', 'g'), '');
  v_guest_email text := lower(nullif(trim(coalesce(p_guest_email, '')), ''));
begin
  if v_ref is null then
    raise exception 'Order reference is required.';
  end if;

  select *
    into v_order
  from public.orders o
  where o.customer_id is null
    and (o.code = v_ref or o.id::text = v_ref)
    and (
      (v_guest_phone is null and v_guest_email is null)
      or (v_guest_phone is not null and nullif(trim(coalesce(o.delivery_address ->> 'guestPhoneNormalized', '')), '') = v_guest_phone)
      or (v_guest_email is not null and lower(nullif(trim(coalesce(o.delivery_address ->> 'guestEmail', '')), '')) = v_guest_email)
    )
  order by o.placed_at desc
  limit 1;

  if not found then
    return jsonb_build_object('order', null, 'items', '[]'::jsonb, 'history', '[]'::jsonb);
  end if;

  return jsonb_build_object(
    'order', to_jsonb(v_order),
    'items', coalesce(
      (select jsonb_agg(to_jsonb(oi) order by oi.created_at, oi.id) from public.order_items oi where oi.order_id = v_order.id),
      '[]'::jsonb
    ),
    'history', coalesce(
      (select jsonb_agg(to_jsonb(h) order by h.changed_at) from public.order_status_history h where h.order_id = v_order.id),
      '[]'::jsonb
    )
  );
end;
$$;

create or replace function public.merge_guest_orders_into_customer(
  p_guest_phone_normalized text default null,
  p_guest_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid := auth.uid();
  v_guest_phone text := nullif(regexp_replace(coalesce(p_guest_phone_normalized, ''), '\s+', '', 'g'), '');
  v_guest_email text := lower(nullif(trim(coalesce(p_guest_email, '')), ''));
  v_merged_count integer := 0;
begin
  if v_customer_id is null then
    raise exception 'You must be signed in to merge guest orders.';
  end if;

  if v_guest_phone is null and v_guest_email is null then
    return jsonb_build_object('merged', false, 'mergedCount', 0, 'reason', 'missing_guest_identity');
  end if;

  update public.orders o
  set customer_id = v_customer_id,
      updated_at = now()
  where o.customer_id is null
    and (
      (v_guest_phone is not null and nullif(trim(coalesce(o.delivery_address ->> 'guestPhoneNormalized', '')), '') = v_guest_phone)
      or (v_guest_email is not null and lower(nullif(trim(coalesce(o.delivery_address ->> 'guestEmail', '')), '')) = v_guest_email)
    );

  get diagnostics v_merged_count = row_count;

  with inserted_stamp_events as (
    insert into public.loyalty_stamp_events (
      customer_id,
      order_id,
      stamp_delta,
      source,
      earned_at
    )
    select
      o.customer_id,
      o.id,
      1,
      'guest_order_merge',
      coalesce(o.updated_at, o.placed_at, o.created_at, now())
    from public.orders o
    where o.customer_id = v_customer_id
      and o.status in ('completed', 'delivered')
    on conflict (order_id) do nothing
    returning customer_id
  ),
  stamps_to_add as (
    select customer_id, count(*)::integer as added_stamps
    from inserted_stamp_events
    group by customer_id
  )
  insert into public.loyalty_accounts (customer_id, stamp_count, updated_at)
  select
    customer_id,
    added_stamps,
    now()
  from stamps_to_add
  on conflict (customer_id) do update
    set stamp_count = public.loyalty_accounts.stamp_count + excluded.stamp_count,
        updated_at = now();

  return jsonb_build_object(
    'merged', v_merged_count > 0,
    'mergedCount', v_merged_count
  );
end;
$$;

grant execute on function public.validate_delivery_address(jsonb) to anon, authenticated;
grant execute on function public.create_customer_order(
  public.order_type,
  public.payment_method,
  numeric,
  numeric,
  numeric,
  numeric,
  jsonb,
  text,
  text,
  jsonb,
  timestamptz,
  text,
  text
) to anon, authenticated;
grant execute on function public.get_guest_order_for_tracking(text, text, text) to anon, authenticated;
grant execute on function public.merge_guest_orders_into_customer(text, text) to authenticated;

notify pgrst, 'reload schema';
