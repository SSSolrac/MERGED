-- =========================================================
-- DELIVERY COVERAGE SCHEMA (Leaflet/OpenStreetMap friendly)
-- Apply this after unified_schema.sql
-- =========================================================

create table if not exists public.delivery_areas (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Ilang-Ilang Delivery Zone',
  fixed_barangay_name text not null default 'Ilayang Iyam',
  city text not null default 'Lucena City',
  province text not null default 'Quezon',
  country text not null default 'Philippines',
  is_active boolean not null default true,
  delivery_status text not null default 'active' check (lower(delivery_status) in ('active', 'inactive')),
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.delivery_puroks (
  id uuid primary key default gen_random_uuid(),
  delivery_area_id uuid not null references public.delivery_areas(id) on delete cascade,
  purok_name text not null,
  is_active boolean not null default true,
  delivery_status text not null default 'active' check (lower(delivery_status) in ('active', 'inactive')),
  sort_order integer not null default 0 check (sort_order >= 0),
  lat double precision,
  lng double precision,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.delivery_puroks add column if not exists lat double precision;
alter table public.delivery_puroks add column if not exists lng double precision;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'delivery_puroks_coordinates_pair_chk'
      and conrelid = 'public.delivery_puroks'::regclass
  ) then
    alter table public.delivery_puroks
      add constraint delivery_puroks_coordinates_pair_chk
      check (
        (lat is null and lng is null)
        or (
          lat >= -90 and lat <= 90
          and lng >= -180 and lng <= 180
        )
      );
  end if;
end
$$;

create table if not exists public.delivery_area_polygons (
  id uuid primary key default gen_random_uuid(),
  delivery_area_id uuid not null references public.delivery_areas(id) on delete cascade,
  lat double precision not null check (lat >= -90 and lat <= 90),
  lng double precision not null check (lng >= -180 and lng <= 180),
  point_order integer not null check (point_order >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.delivery_area_versions (
  id uuid primary key default gen_random_uuid(),
  delivery_area_id uuid not null references public.delivery_areas(id) on delete cascade,
  snapshot jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_delivery_puroks_unique_name
  on public.delivery_puroks(delivery_area_id, lower(trim(purok_name)));
create unique index if not exists idx_delivery_area_polygons_unique_point_order
  on public.delivery_area_polygons(delivery_area_id, point_order);
create index if not exists idx_delivery_areas_active_status
  on public.delivery_areas(is_active, delivery_status, updated_at desc);
create index if not exists idx_delivery_puroks_area_active_status
  on public.delivery_puroks(delivery_area_id, is_active, delivery_status, sort_order asc);
create index if not exists idx_delivery_area_polygons_area_order
  on public.delivery_area_polygons(delivery_area_id, point_order asc);

drop trigger if exists trg_delivery_areas_updated_at on public.delivery_areas;
create trigger trg_delivery_areas_updated_at
before update on public.delivery_areas
for each row execute procedure public.set_updated_at();

drop trigger if exists trg_delivery_puroks_updated_at on public.delivery_puroks;
create trigger trg_delivery_puroks_updated_at
before update on public.delivery_puroks
for each row execute procedure public.set_updated_at();

create or replace function public.is_point_inside_polygon(
  p_lat double precision,
  p_lng double precision,
  p_polygon jsonb
)
returns boolean
language plpgsql
stable
as $$
declare
  v_count integer;
  v_i integer;
  v_j integer;
  v_inside boolean := false;
  v_xi double precision;
  v_yi double precision;
  v_xj double precision;
  v_yj double precision;
begin
  if p_polygon is null then
    return false;
  end if;

  v_count := coalesce(jsonb_array_length(p_polygon), 0);
  if v_count < 3 then
    return false;
  end if;

  v_j := v_count - 1;
  v_i := 0;

  while v_i < v_count loop
    v_xi := coalesce((p_polygon -> v_i ->> 'lng')::double precision, 0);
    v_yi := coalesce((p_polygon -> v_i ->> 'lat')::double precision, 0);
    v_xj := coalesce((p_polygon -> v_j ->> 'lng')::double precision, 0);
    v_yj := coalesce((p_polygon -> v_j ->> 'lat')::double precision, 0);

    if ((v_yi > p_lat) <> (v_yj > p_lat))
      and (
        p_lng <
        ((v_xj - v_xi) * (p_lat - v_yi) / nullif(v_yj - v_yi, 0) + v_xi)
      )
    then
      v_inside := not v_inside;
    end if;

    v_j := v_i;
    v_i := v_i + 1;
  end loop;

  return v_inside;
end;
$$;

create or replace function public.build_delivery_address(
  p_house_details text,
  p_purok_name text,
  p_fixed_barangay_name text,
  p_city text,
  p_province text,
  p_country text
)
returns text
language plpgsql
immutable
as $$
declare
  v_house text := nullif(trim(coalesce(p_house_details, '')), '');
  v_purok text := nullif(trim(coalesce(p_purok_name, '')), '');
  v_barangay text := nullif(trim(coalesce(p_fixed_barangay_name, '')), '');
  v_city text := nullif(trim(coalesce(p_city, '')), '');
  v_province text := nullif(trim(coalesce(p_province, '')), '');
  v_country text := nullif(trim(coalesce(p_country, '')), '');
begin
  if v_house is null or v_purok is null or v_barangay is null or v_city is null or v_province is null or v_country is null then
    raise exception 'Delivery address is incomplete.';
  end if;

  return format('%s, %s, %s, %s, %s, %s', v_house, v_purok, v_barangay, v_city, v_province, v_country);
end;
$$;

create or replace function public.validate_delivery_address(
  p_delivery_address jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_area public.delivery_areas%rowtype;
  v_purok public.delivery_puroks%rowtype;
  v_polygon jsonb;
  v_polygon_count integer;
  v_area_id uuid;
  v_purok_id uuid;
  v_house_details text;
  v_selected_purok_name text;
  v_lat double precision;
  v_lng double precision;
  v_normalized_address text;
begin
  if p_delivery_address is null then
    raise exception 'Delivery address payload is required.';
  end if;

  v_house_details := nullif(trim(coalesce(
    p_delivery_address ->> 'houseDetails',
    p_delivery_address ->> 'house_details'
  )), '');

  if v_house_details is null then
    raise exception 'House/Unit/Street/Landmark is required.';
  end if;

  v_area_id := nullif(trim(coalesce(
    p_delivery_address ->> 'deliveryAreaId',
    p_delivery_address ->> 'delivery_area_id'
  )), '')::uuid;

  v_purok_id := nullif(trim(coalesce(
    p_delivery_address ->> 'selectedPurokId',
    p_delivery_address ->> 'selected_purok_id',
    p_delivery_address ->> 'purokId',
    p_delivery_address ->> 'purok_id'
  )), '')::uuid;

  v_selected_purok_name := nullif(trim(coalesce(
    p_delivery_address ->> 'selectedPurokName',
    p_delivery_address ->> 'selected_purok_name',
    p_delivery_address ->> 'purokName',
    p_delivery_address ->> 'purok'
  )), '');

  v_lat := nullif(trim(coalesce(
    p_delivery_address ->> 'latitude',
    p_delivery_address ->> 'lat'
  )), '')::double precision;

  v_lng := nullif(trim(coalesce(
    p_delivery_address ->> 'longitude',
    p_delivery_address ->> 'lng'
  )), '')::double precision;

  if v_area_id is not null then
    select *
      into v_area
    from public.delivery_areas da
    where da.id = v_area_id
      and da.is_active = true
      and lower(da.delivery_status) = 'active'
    limit 1;
  else
    select *
      into v_area
    from public.delivery_areas da
    where da.is_active = true
      and lower(da.delivery_status) = 'active'
    order by da.updated_at desc
    limit 1;
  end if;

  if not found then
    raise exception 'Delivery area is currently unavailable.';
  end if;

  if v_purok_id is not null then
    select *
      into v_purok
    from public.delivery_puroks dp
    where dp.id = v_purok_id
      and dp.delivery_area_id = v_area.id
      and dp.is_active = true
      and lower(dp.delivery_status) = 'active'
    limit 1;
  else
    select *
      into v_purok
    from public.delivery_puroks dp
    where dp.delivery_area_id = v_area.id
      and lower(trim(dp.purok_name)) = lower(trim(coalesce(v_selected_purok_name, '')))
      and dp.is_active = true
      and lower(dp.delivery_status) = 'active'
    limit 1;
  end if;

  if not found then
    raise exception 'Selected purok is unavailable for delivery.';
  end if;

  if v_lat is null or v_lng is null then
    v_lat := v_purok.lat;
    v_lng := v_purok.lng;
  end if;

  if v_lat is null or v_lng is null then
    raise exception 'Selected purok is missing map coordinates. Please choose a configured purok.';
  end if;

  if v_lat < -90 or v_lat > 90 or v_lng < -180 or v_lng > 180 then
    raise exception 'Map pin coordinates are invalid.';
  end if;

  select
    coalesce(
      jsonb_agg(
        jsonb_build_object('lat', dap.lat, 'lng', dap.lng)
        order by dap.point_order asc
      ),
      '[]'::jsonb
    ),
    count(*)
  into v_polygon, v_polygon_count
  from public.delivery_area_polygons dap
  where dap.delivery_area_id = v_area.id;

  if v_polygon_count < 3 then
    raise exception 'Delivery polygon is not configured.';
  end if;

  if not public.is_point_inside_polygon(v_lat, v_lng, v_polygon) then
    raise exception 'Selected map pin is outside our delivery area.';
  end if;

  v_normalized_address := public.build_delivery_address(
    v_house_details,
    v_purok.purok_name,
    v_area.fixed_barangay_name,
    v_area.city,
    v_area.province,
    v_area.country
  );

  return jsonb_build_object(
    'deliveryAreaId', v_area.id,
    'selectedPurokId', v_purok.id,
    'selectedPurokName', v_purok.purok_name,
    'fixedBarangayName', v_area.fixed_barangay_name,
    'city', v_area.city,
    'province', v_area.province,
    'country', v_area.country,
    'normalizedAddress', v_normalized_address,
    'latitude', v_lat,
    'longitude', v_lng
  );
end;
$$;

-- Re-define customer order RPC with delivery-area validation.
drop function if exists public.create_customer_order(
  public.order_type,
  public.payment_method,
  numeric,
  numeric,
  numeric,
  jsonb,
  text,
  text,
  jsonb,
  timestamptz
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
  p_placed_at timestamptz default now()
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_customer_id uuid;
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
  v_customer_id := auth.uid();
  if v_customer_id is null then
    raise exception 'Authentication required.';
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

  v_delivery_payload := p_delivery_address;
  if p_order_type = 'delivery' then
    if p_delivery_address is null then
      raise exception 'Delivery address is required for delivery orders.';
    end if;

    v_delivery_validation := public.validate_delivery_address(p_delivery_address);
    v_delivery_payload := coalesce(p_delivery_address, '{}'::jsonb) || jsonb_build_object(
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

insert into public.delivery_areas (
  name,
  fixed_barangay_name,
  city,
  province,
  country,
  is_active,
  delivery_status
)
select
  'Ilang-Ilang Delivery Zone',
  'Ilayang Iyam',
  'Lucena City',
  'Quezon',
  'Philippines',
  true,
  'active'
where not exists (
  select 1 from public.delivery_areas
);

insert into public.delivery_puroks (delivery_area_id, purok_name, sort_order, lat, lng, is_active, delivery_status)
select
  da.id,
  seed.purok_name,
  seed.sort_order,
  seed.lat,
  seed.lng,
  true,
  'active'
from (
  values
    ('Purok Pinagbuklod', 1, 13.94345::double precision, 121.61923::double precision),
    ('Purok Carmelita', 2, 13.94090::double precision, 121.62780::double precision),
    ('Purok Sampaguita', 3, 13.93680::double precision, 121.62620::double precision)
) as seed(purok_name, sort_order, lat, lng)
cross join (
  select id
  from public.delivery_areas
  where is_active = true and lower(delivery_status) = 'active'
  order by updated_at desc
  limit 1
) da
where not exists (
  select 1
  from public.delivery_puroks dp
  where dp.delivery_area_id = da.id
);

with area_centers as (
  select
    da.id as delivery_area_id,
    coalesce(avg(dap.lat), 13.94160::double precision) as center_lat,
    coalesce(avg(dap.lng), 121.62240::double precision) as center_lng
  from public.delivery_areas da
  left join public.delivery_area_polygons dap on dap.delivery_area_id = da.id
  group by da.id
)
update public.delivery_puroks dp
set
  lat = case
    when lower(trim(dp.purok_name)) = 'purok pinagbuklod' then 13.94345::double precision
    when lower(trim(dp.purok_name)) = 'purok carmelita' then 13.94090::double precision
    when lower(trim(dp.purok_name)) = 'purok sampaguita' then 13.93680::double precision
    else ac.center_lat
  end,
  lng = case
    when lower(trim(dp.purok_name)) = 'purok pinagbuklod' then 121.61923::double precision
    when lower(trim(dp.purok_name)) = 'purok carmelita' then 121.62780::double precision
    when lower(trim(dp.purok_name)) = 'purok sampaguita' then 121.62620::double precision
    else ac.center_lng
  end
from area_centers ac
where dp.delivery_area_id = ac.delivery_area_id
  and (dp.lat is null or dp.lng is null);

insert into public.delivery_area_polygons (delivery_area_id, lat, lng, point_order)
select
  da.id,
  seed.lat,
  seed.lng,
  seed.point_order
from (
  values
    (13.94345::double precision, 121.61923::double precision, 0),
    (13.94420::double precision, 121.62540::double precision, 1),
    (13.94090::double precision, 121.62780::double precision, 2),
    (13.93680::double precision, 121.62620::double precision, 3),
    (13.93590::double precision, 121.62030::double precision, 4),
    (13.93980::double precision, 121.61790::double precision, 5)
) as seed(lat, lng, point_order)
cross join (
  select id
  from public.delivery_areas
  where is_active = true and lower(delivery_status) = 'active'
  order by updated_at desc
  limit 1
) da
where not exists (
  select 1
  from public.delivery_area_polygons dap
  where dap.delivery_area_id = da.id
);

alter table public.delivery_areas enable row level security;
alter table public.delivery_puroks enable row level security;
alter table public.delivery_area_polygons enable row level security;
alter table public.delivery_area_versions enable row level security;

drop policy if exists "delivery_areas_read_all" on public.delivery_areas;
create policy "delivery_areas_read_all"
on public.delivery_areas for select
using (true);

drop policy if exists "delivery_puroks_read_all" on public.delivery_puroks;
create policy "delivery_puroks_read_all"
on public.delivery_puroks for select
using (true);

drop policy if exists "delivery_area_polygons_read_all" on public.delivery_area_polygons;
create policy "delivery_area_polygons_read_all"
on public.delivery_area_polygons for select
using (true);

drop policy if exists "delivery_area_versions_read_owner_staff" on public.delivery_area_versions;
create policy "delivery_area_versions_read_owner_staff"
on public.delivery_area_versions for select
using (public.is_owner_or_staff());

drop policy if exists "delivery_areas_manage_owner_staff" on public.delivery_areas;
create policy "delivery_areas_manage_owner_staff"
on public.delivery_areas for all
using (public.is_owner_or_staff())
with check (public.is_owner_or_staff());

drop policy if exists "delivery_puroks_manage_owner_staff" on public.delivery_puroks;
create policy "delivery_puroks_manage_owner_staff"
on public.delivery_puroks for all
using (public.is_owner_or_staff())
with check (public.is_owner_or_staff());

drop policy if exists "delivery_area_polygons_manage_owner_staff" on public.delivery_area_polygons;
create policy "delivery_area_polygons_manage_owner_staff"
on public.delivery_area_polygons for all
using (public.is_owner_or_staff())
with check (public.is_owner_or_staff());

drop policy if exists "delivery_area_versions_manage_owner_staff" on public.delivery_area_versions;
create policy "delivery_area_versions_manage_owner_staff"
on public.delivery_area_versions for all
using (public.is_owner_or_staff())
with check (public.is_owner_or_staff());

grant select on table public.delivery_areas to anon;
grant select on table public.delivery_puroks to anon;
grant select on table public.delivery_area_polygons to anon;

grant select, insert, update, delete on table public.delivery_areas to authenticated;
grant select, insert, update, delete on table public.delivery_puroks to authenticated;
grant select, insert, update, delete on table public.delivery_area_polygons to authenticated;
grant select, insert on table public.delivery_area_versions to authenticated;

grant execute on function public.is_point_inside_polygon(double precision, double precision, jsonb) to authenticated, anon;
grant execute on function public.build_delivery_address(text, text, text, text, text, text) to authenticated, anon;
grant execute on function public.validate_delivery_address(jsonb) to authenticated;
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
  timestamptz
) to authenticated;
