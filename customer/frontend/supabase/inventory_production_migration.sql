-- Inventory production and waste tracking for the unified cafe app.
-- Run this after unified_schema.sql on existing databases.

alter table public.inventory_items
  add column if not exists item_type text not null default 'raw_material',
  add column if not exists recipe_yield_quantity numeric(12,3) not null default 1;

update public.inventory_items
set item_type = 'raw_material'
where item_type is null or item_type not in ('raw_material', 'finished_product');

update public.inventory_items
set recipe_yield_quantity = 1
where recipe_yield_quantity is null or recipe_yield_quantity <= 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'inventory_items_item_type_chk'
      and conrelid = 'public.inventory_items'::regclass
  ) then
    alter table public.inventory_items
      add constraint inventory_items_item_type_chk
      check (item_type in ('raw_material', 'finished_product'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'inventory_items_recipe_yield_quantity_chk'
      and conrelid = 'public.inventory_items'::regclass
  ) then
    alter table public.inventory_items
      add constraint inventory_items_recipe_yield_quantity_chk
      check (recipe_yield_quantity > 0);
  end if;
end $$;

create table if not exists public.inventory_recipe_lines (
  id uuid primary key default gen_random_uuid(),
  finished_item_id uuid not null references public.inventory_items(id) on delete cascade,
  raw_item_id uuid not null references public.inventory_items(id) on delete restrict,
  quantity_required numeric(12,3) not null check (quantity_required > 0),
  unit text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(finished_item_id, raw_item_id)
);

drop trigger if exists trg_inventory_recipe_lines_updated_at on public.inventory_recipe_lines;
create trigger trg_inventory_recipe_lines_updated_at
before update on public.inventory_recipe_lines
for each row execute procedure public.set_updated_at();

create index if not exists idx_inventory_recipe_lines_finished_item_id
  on public.inventory_recipe_lines(finished_item_id);
create index if not exists idx_inventory_recipe_lines_raw_item_id
  on public.inventory_recipe_lines(raw_item_id);

create table if not exists public.inventory_stock_movements (
  id uuid primary key default gen_random_uuid(),
  inventory_item_id uuid not null references public.inventory_items(id) on delete cascade,
  movement_type text not null,
  quantity_delta numeric(12,3) not null,
  quantity_before numeric(12,3) not null,
  quantity_after numeric(12,3) not null check (quantity_after >= 0),
  reason text,
  reference_id text,
  metadata jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.inventory_stock_movements
  add column if not exists reversal_of_movement_id uuid references public.inventory_stock_movements(id) on delete set null,
  add column if not exists reversed_by_movement_id uuid references public.inventory_stock_movements(id) on delete set null,
  add column if not exists voided_at timestamptz,
  add column if not exists void_reason text;

alter table public.inventory_stock_movements
  drop constraint if exists inventory_stock_movements_movement_type_check;

alter table public.inventory_stock_movements
  add constraint inventory_stock_movements_movement_type_check
  check (movement_type in ('stock_in', 'stock_out', 'waste', 'production', 'correction', 'undo'));

create index if not exists idx_inventory_stock_movements_item_id
  on public.inventory_stock_movements(inventory_item_id);
create index if not exists idx_inventory_stock_movements_type_created_at
  on public.inventory_stock_movements(movement_type, created_at desc);
create index if not exists idx_inventory_stock_movements_created_at
  on public.inventory_stock_movements(created_at desc);
create index if not exists idx_inventory_stock_movements_reference_id
  on public.inventory_stock_movements(reference_id);
create index if not exists idx_inventory_stock_movements_reversal_of
  on public.inventory_stock_movements(reversal_of_movement_id);

create table if not exists public.menu_item_inventory_recipe_lines (
  id uuid primary key default gen_random_uuid(),
  menu_item_id uuid not null references public.menu_items(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
  quantity_required numeric(12,3) not null check (quantity_required > 0),
  unit text,
  display_quantity text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(menu_item_id, inventory_item_id)
);

alter table public.menu_item_inventory_recipe_lines
  add column if not exists display_quantity text;

drop trigger if exists trg_menu_item_inventory_recipe_lines_updated_at on public.menu_item_inventory_recipe_lines;
create trigger trg_menu_item_inventory_recipe_lines_updated_at
before update on public.menu_item_inventory_recipe_lines
for each row execute procedure public.set_updated_at();

create index if not exists idx_menu_item_inventory_recipe_lines_menu_item_id
  on public.menu_item_inventory_recipe_lines(menu_item_id);
create index if not exists idx_menu_item_inventory_recipe_lines_inventory_item_id
  on public.menu_item_inventory_recipe_lines(inventory_item_id);

create or replace function public.apply_inventory_stock_movement(
  p_inventory_item_id uuid,
  p_movement_type text,
  p_quantity_delta numeric,
  p_reason text default null,
  p_reference_id text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_reversal_of_movement_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.inventory_items%rowtype;
  v_saved_item public.inventory_items%rowtype;
  v_movement public.inventory_stock_movements%rowtype;
  v_movement_type text := lower(trim(coalesce(p_movement_type, '')));
  v_quantity_delta numeric(12,3) := round(coalesce(p_quantity_delta, 0), 3);
  v_quantity_after numeric(12,3);
begin
  if auth.uid() is not null and not public.is_owner_or_staff() then
    raise exception 'Access denied.';
  end if;

  if v_movement_type not in ('stock_in', 'stock_out', 'waste', 'production', 'correction', 'undo') then
    raise exception 'Invalid inventory movement type.';
  end if;

  if v_quantity_delta = 0 then
    raise exception 'Inventory movement quantity cannot be zero.';
  end if;

  select *
    into v_item
  from public.inventory_items
  where id = p_inventory_item_id
  for update;

  if not found then
    raise exception 'Inventory item not found.';
  end if;

  v_quantity_after := round(v_item.quantity_on_hand + v_quantity_delta, 3);
  if v_quantity_after < 0 then
    raise exception 'Invalid stock deduction. Quantity on hand is not enough.';
  end if;

  update public.inventory_items
  set
    quantity_on_hand = v_quantity_after,
    display_quantity = v_quantity_after::text,
    updated_at = now()
  where id = v_item.id
  returning *
  into v_saved_item;

  insert into public.inventory_stock_movements (
    inventory_item_id,
    movement_type,
    quantity_delta,
    quantity_before,
    quantity_after,
    reason,
    reference_id,
    metadata,
    created_by,
    reversal_of_movement_id
  )
  values (
    v_item.id,
    v_movement_type,
    v_quantity_delta,
    v_item.quantity_on_hand,
    v_quantity_after,
    nullif(trim(coalesce(p_reason, '')), ''),
    nullif(trim(coalesce(p_reference_id, '')), ''),
    coalesce(p_metadata, '{}'::jsonb),
    auth.uid(),
    p_reversal_of_movement_id
  )
  returning *
  into v_movement;

  return jsonb_build_object(
    'item', to_jsonb(v_saved_item),
    'movement', to_jsonb(v_movement)
  );
end;
$$;

create or replace function public.produce_inventory_finished_product(
  p_finished_item_id uuid,
  p_quantity numeric,
  p_reason text default null,
  p_reference_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_finished public.inventory_items%rowtype;
  v_saved_item public.inventory_items%rowtype;
  v_raw public.inventory_items%rowtype;
  v_movement public.inventory_stock_movements%rowtype;
  v_line public.inventory_recipe_lines%rowtype;
  v_quantity numeric(12,3) := round(coalesce(p_quantity, 0), 3);
  v_multiplier numeric(12,6);
  v_required numeric(12,3);
  v_reference_id text := coalesce(nullif(trim(coalesce(p_reference_id, '')), ''), gen_random_uuid()::text);
  v_items jsonb := '[]'::jsonb;
  v_movements jsonb := '[]'::jsonb;
  v_recipe_count integer;
begin
  if auth.uid() is not null and not public.is_owner_or_staff() then
    raise exception 'Access denied.';
  end if;

  if v_quantity <= 0 then
    raise exception 'Production quantity must be greater than zero.';
  end if;

  select *
    into v_finished
  from public.inventory_items
  where id = p_finished_item_id
  for update;

  if not found then
    raise exception 'Finished product not found.';
  end if;

  if v_finished.item_type <> 'finished_product' then
    raise exception 'Selected item is not a finished product.';
  end if;

  select count(*)
    into v_recipe_count
  from public.inventory_recipe_lines
  where finished_item_id = v_finished.id;

  if coalesce(v_recipe_count, 0) = 0 then
    raise exception 'Add at least one raw material recipe line before production.';
  end if;

  v_multiplier := v_quantity / greatest(coalesce(v_finished.recipe_yield_quantity, 1), 1);

  for v_line in
    select *
    from public.inventory_recipe_lines
    where finished_item_id = v_finished.id
    order by created_at, id
  loop
    select *
      into v_raw
    from public.inventory_items
    where id = v_line.raw_item_id
    for update;

    if not found then
      raise exception 'A recipe raw material is missing from inventory.';
    end if;

    v_required := round(v_line.quantity_required * v_multiplier, 3);
    if v_required <= 0 then
      raise exception 'Recipe quantity must be greater than zero.';
    end if;

    if v_raw.quantity_on_hand < v_required then
      raise exception '% is insufficient. Needed %, available %.', v_raw.name, v_required, v_raw.quantity_on_hand;
    end if;

    update public.inventory_items
    set
      quantity_on_hand = round(v_raw.quantity_on_hand - v_required, 3),
      display_quantity = round(v_raw.quantity_on_hand - v_required, 3)::text,
      updated_at = now()
    where id = v_raw.id
    returning *
    into v_saved_item;

    insert into public.inventory_stock_movements (
      inventory_item_id,
      movement_type,
      quantity_delta,
      quantity_before,
      quantity_after,
      reason,
      reference_id,
      metadata,
      created_by
    )
    values (
      v_raw.id,
      'production',
      -v_required,
      v_raw.quantity_on_hand,
      v_saved_item.quantity_on_hand,
      coalesce(nullif(trim(coalesce(p_reason, '')), ''), 'Raw material deducted for production'),
      v_reference_id,
      jsonb_build_object(
        'source', 'production',
        'finishedItemId', v_finished.id,
        'finishedItemName', v_finished.name,
        'producedQuantity', v_quantity,
        'recipeLineId', v_line.id
      ),
      auth.uid()
    )
    returning *
    into v_movement;

    v_items := v_items || jsonb_build_array(to_jsonb(v_saved_item));
    v_movements := v_movements || jsonb_build_array(to_jsonb(v_movement));
  end loop;

  update public.inventory_items
  set
    quantity_on_hand = round(v_finished.quantity_on_hand + v_quantity, 3),
    display_quantity = round(v_finished.quantity_on_hand + v_quantity, 3)::text,
    updated_at = now()
  where id = v_finished.id
  returning *
  into v_saved_item;

  insert into public.inventory_stock_movements (
    inventory_item_id,
    movement_type,
    quantity_delta,
    quantity_before,
    quantity_after,
    reason,
    reference_id,
    metadata,
    created_by
  )
  values (
    v_finished.id,
    'production',
    v_quantity,
    v_finished.quantity_on_hand,
    v_saved_item.quantity_on_hand,
    coalesce(nullif(trim(coalesce(p_reason, '')), ''), 'Finished product produced from raw materials'),
    v_reference_id,
    jsonb_build_object(
      'source', 'production',
      'finishedItemId', v_finished.id,
      'finishedItemName', v_finished.name,
      'producedQuantity', v_quantity
    ),
    auth.uid()
  )
  returning *
  into v_movement;

  v_items := v_items || jsonb_build_array(to_jsonb(v_saved_item));
  v_movements := v_movements || jsonb_build_array(to_jsonb(v_movement));

  return jsonb_build_object(
    'items', v_items,
    'movements', v_movements,
    'referenceId', v_reference_id
  );
end;
$$;

create or replace function public.deduct_menu_item_inventory_for_order_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line public.menu_item_inventory_recipe_lines%rowtype;
  v_item public.inventory_items%rowtype;
  v_saved_item public.inventory_items%rowtype;
  v_required numeric(12,3);
  v_quantity integer := greatest(coalesce(new.quantity, 1), 1);
begin
  if new.menu_item_id is null then
    return new;
  end if;

  for v_line in
    select *
    from public.menu_item_inventory_recipe_lines
    where menu_item_id = new.menu_item_id
    order by created_at, id
  loop
    select *
      into v_item
    from public.inventory_items
    where id = v_line.inventory_item_id
    for update;

    if not found then
      raise exception 'A menu ingredient is missing from inventory.';
    end if;

    v_required := round(v_line.quantity_required * v_quantity, 3);
    if v_required <= 0 then
      raise exception 'Menu ingredient quantity must be greater than zero.';
    end if;

    if v_item.quantity_on_hand < v_required then
      raise exception '% is insufficient. Needed %, available %.', v_item.name, v_required, v_item.quantity_on_hand;
    end if;

    update public.inventory_items
    set
      quantity_on_hand = round(v_item.quantity_on_hand - v_required, 3),
      display_quantity = round(v_item.quantity_on_hand - v_required, 3)::text,
      updated_at = now()
    where id = v_item.id
    returning *
    into v_saved_item;

    insert into public.inventory_stock_movements (
      inventory_item_id,
      movement_type,
      quantity_delta,
      quantity_before,
      quantity_after,
      reason,
      reference_id,
      metadata,
      created_by
    )
    values (
      v_item.id,
      'stock_out',
      -v_required,
      v_item.quantity_on_hand,
      v_saved_item.quantity_on_hand,
      coalesce(nullif(trim(new.item_name), ''), 'Menu item') || ' sold',
      new.order_id::text,
      jsonb_build_object(
        'source', 'menu_item_sale',
        'orderId', new.order_id,
        'orderItemId', new.id,
        'menuItemId', new.menu_item_id,
        'menuItemName', new.item_name,
        'menuItemCode', new.menu_item_code,
        'quantitySold', v_quantity,
        'recipeLineId', v_line.id,
        'displayQuantity', v_line.display_quantity,
        'unit', coalesce(v_line.unit, v_item.unit)
      ),
      auth.uid()
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_order_items_deduct_menu_inventory on public.order_items;
create trigger trg_order_items_deduct_menu_inventory
after insert on public.order_items
for each row execute procedure public.deduct_menu_item_inventory_for_order_item();

create or replace function public.restore_menu_item_inventory_for_order(
  p_order_id uuid,
  p_reason text default 'Order cancelled or refunded'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_movement public.inventory_stock_movements%rowtype;
  v_item public.inventory_items%rowtype;
  v_saved_item public.inventory_items%rowtype;
  v_undo_movement public.inventory_stock_movements%rowtype;
  v_restore_quantity numeric(12,3);
  v_restored_count integer := 0;
begin
  if p_order_id is null then
    return jsonb_build_object('restoredCount', 0);
  end if;

  for v_movement in
    select *
    from public.inventory_stock_movements
    where reference_id = p_order_id::text
      and movement_type = 'stock_out'
      and quantity_delta < 0
      and coalesce(metadata ->> 'source', '') = 'menu_item_sale'
      and reversed_by_movement_id is null
      and voided_at is null
    order by created_at desc, id desc
  loop
    v_restore_quantity := round(abs(v_movement.quantity_delta), 3);
    if v_restore_quantity <= 0 then
      continue;
    end if;

    select *
      into v_item
    from public.inventory_items
    where id = v_movement.inventory_item_id
    for update;

    if not found then
      continue;
    end if;

    update public.inventory_items
    set
      quantity_on_hand = round(v_item.quantity_on_hand + v_restore_quantity, 3),
      display_quantity = round(v_item.quantity_on_hand + v_restore_quantity, 3)::text,
      updated_at = now()
    where id = v_item.id
    returning *
    into v_saved_item;

    insert into public.inventory_stock_movements (
      inventory_item_id,
      movement_type,
      quantity_delta,
      quantity_before,
      quantity_after,
      reason,
      reference_id,
      metadata,
      created_by,
      reversal_of_movement_id
    )
    values (
      v_item.id,
      'undo',
      v_restore_quantity,
      v_item.quantity_on_hand,
      v_saved_item.quantity_on_hand,
      coalesce(nullif(trim(coalesce(p_reason, '')), ''), 'Order inventory deduction reversed'),
      p_order_id::text,
      coalesce(v_movement.metadata, '{}'::jsonb) || jsonb_build_object(
        'source', 'menu_item_sale_reversal',
        'originalMovementId', v_movement.id,
        'orderId', p_order_id
      ),
      auth.uid(),
      v_movement.id
    )
    returning *
    into v_undo_movement;

    update public.inventory_stock_movements
    set
      reversed_by_movement_id = v_undo_movement.id,
      voided_at = now(),
      void_reason = coalesce(nullif(trim(coalesce(p_reason, '')), ''), 'Order inventory deduction reversed')
    where id = v_movement.id;

    v_restored_count := v_restored_count + 1;
  end loop;

  return jsonb_build_object('restoredCount', v_restored_count);
end;
$$;

create or replace function public.restore_menu_inventory_on_order_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status is distinct from new.status
    and new.status in ('cancelled', 'refunded')
  then
    perform public.restore_menu_item_inventory_for_order(
      new.id,
      'Order status changed to ' || new.status::text
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_orders_restore_menu_inventory on public.orders;
create trigger trg_orders_restore_menu_inventory
after update of status on public.orders
for each row execute procedure public.restore_menu_inventory_on_order_status();

alter table public.inventory_recipe_lines enable row level security;
alter table public.inventory_stock_movements enable row level security;
alter table public.menu_item_inventory_recipe_lines enable row level security;

grant select, insert, update, delete on table public.inventory_recipe_lines to authenticated;
grant select, insert, update on table public.inventory_stock_movements to authenticated;
grant select, insert, update, delete on table public.menu_item_inventory_recipe_lines to authenticated;
grant execute on function public.apply_inventory_stock_movement(uuid, text, numeric, text, text, jsonb, uuid) to authenticated;
grant execute on function public.produce_inventory_finished_product(uuid, numeric, text, text) to authenticated;
grant execute on function public.restore_menu_item_inventory_for_order(uuid, text) to authenticated;

drop policy if exists "inventory_recipe_lines_manage_owner_staff" on public.inventory_recipe_lines;
drop policy if exists "inventory_recipe_lines_read_owner_staff" on public.inventory_recipe_lines;
drop policy if exists "inventory_recipe_lines_insert_owner_staff" on public.inventory_recipe_lines;
drop policy if exists "inventory_recipe_lines_update_owner_staff" on public.inventory_recipe_lines;
drop policy if exists "inventory_recipe_lines_delete_owner_staff" on public.inventory_recipe_lines;
create policy "inventory_recipe_lines_read_owner_staff"
on public.inventory_recipe_lines for select
using (public.is_owner_or_staff());

create policy "inventory_recipe_lines_insert_owner_staff"
on public.inventory_recipe_lines for insert
with check (public.is_owner_or_staff());

create policy "inventory_recipe_lines_update_owner_staff"
on public.inventory_recipe_lines for update
using (public.is_owner_or_staff())
with check (public.is_owner_or_staff());

create policy "inventory_recipe_lines_delete_owner_staff"
on public.inventory_recipe_lines for delete
using (public.is_owner_or_staff());

drop policy if exists "inventory_stock_movements_read_owner_staff" on public.inventory_stock_movements;
create policy "inventory_stock_movements_read_owner_staff"
on public.inventory_stock_movements for select
using (public.is_owner_or_staff());

drop policy if exists "inventory_stock_movements_insert_owner_staff" on public.inventory_stock_movements;
create policy "inventory_stock_movements_insert_owner_staff"
on public.inventory_stock_movements for insert
with check (public.is_owner_or_staff());

drop policy if exists "inventory_stock_movements_update_owner" on public.inventory_stock_movements;
create policy "inventory_stock_movements_update_owner"
on public.inventory_stock_movements for update
using (public.is_owner())
with check (public.is_owner());

drop policy if exists "menu_item_inventory_recipe_lines_read_owner_staff" on public.menu_item_inventory_recipe_lines;
create policy "menu_item_inventory_recipe_lines_read_owner_staff"
on public.menu_item_inventory_recipe_lines for select
using (public.is_owner_or_staff());

drop policy if exists "menu_item_inventory_recipe_lines_insert_owner_staff" on public.menu_item_inventory_recipe_lines;
create policy "menu_item_inventory_recipe_lines_insert_owner_staff"
on public.menu_item_inventory_recipe_lines for insert
with check (public.is_owner_or_staff());

drop policy if exists "menu_item_inventory_recipe_lines_update_owner_staff" on public.menu_item_inventory_recipe_lines;
create policy "menu_item_inventory_recipe_lines_update_owner_staff"
on public.menu_item_inventory_recipe_lines for update
using (public.is_owner_or_staff())
with check (public.is_owner_or_staff());

drop policy if exists "menu_item_inventory_recipe_lines_delete_owner_staff" on public.menu_item_inventory_recipe_lines;
create policy "menu_item_inventory_recipe_lines_delete_owner_staff"
on public.menu_item_inventory_recipe_lines for delete
using (public.is_owner_or_staff());

drop trigger if exists trg_inventory_recipe_lines_activity on public.inventory_recipe_lines;
create trigger trg_inventory_recipe_lines_activity
after insert or update or delete on public.inventory_recipe_lines
for each row execute procedure public.log_table_activity();

drop trigger if exists trg_inventory_stock_movements_activity on public.inventory_stock_movements;
create trigger trg_inventory_stock_movements_activity
after insert or update or delete on public.inventory_stock_movements
for each row execute procedure public.log_table_activity();

drop trigger if exists trg_menu_item_inventory_recipe_lines_activity on public.menu_item_inventory_recipe_lines;
create trigger trg_menu_item_inventory_recipe_lines_activity
after insert or update or delete on public.menu_item_inventory_recipe_lines
for each row execute procedure public.log_table_activity();
