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
  movement_type text not null check (movement_type in ('stock_in', 'stock_out', 'waste', 'production')),
  quantity_delta numeric(12,3) not null,
  quantity_before numeric(12,3) not null,
  quantity_after numeric(12,3) not null check (quantity_after >= 0),
  reason text,
  reference_id text,
  metadata jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_inventory_stock_movements_item_id
  on public.inventory_stock_movements(inventory_item_id);
create index if not exists idx_inventory_stock_movements_type_created_at
  on public.inventory_stock_movements(movement_type, created_at desc);
create index if not exists idx_inventory_stock_movements_created_at
  on public.inventory_stock_movements(created_at desc);

alter table public.inventory_recipe_lines enable row level security;
alter table public.inventory_stock_movements enable row level security;

grant select, insert, update, delete on table public.inventory_recipe_lines to authenticated;
grant select, insert on table public.inventory_stock_movements to authenticated;

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

drop trigger if exists trg_inventory_recipe_lines_activity on public.inventory_recipe_lines;
create trigger trg_inventory_recipe_lines_activity
after insert or update or delete on public.inventory_recipe_lines
for each row execute procedure public.log_table_activity();

drop trigger if exists trg_inventory_stock_movements_activity on public.inventory_stock_movements;
create trigger trg_inventory_stock_movements_activity
after insert or update or delete on public.inventory_stock_movements
for each row execute procedure public.log_table_activity();
