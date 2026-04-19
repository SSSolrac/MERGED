-- =========================================================
-- HAPPYTAILS / HYGGE TAILS CAFE - UNIFIED SUPABASE SCHEMA
-- Compatible with:
-- 1) staff/owner web app (staffowner/)
-- 2) customer web app (customer/frontend/)
-- =========================================================

-- Recommended extensions
create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- =========================================================
-- ENUMS
-- =========================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('owner', 'staff', 'customer');
  end if;

  if not exists (select 1 from pg_type where typname = 'order_status') then
    create type public.order_status as enum (
      'pending',
      'preparing',
      'ready',
      'out_for_delivery',
      'completed',
      'delivered',
      'cancelled',
      'refunded'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'order_type') then
    create type public.order_type as enum (
      'dine_in',
      'pickup',
      'takeout',
      'delivery'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'payment_method') then
    create type public.payment_method as enum (
      'qrph',
      'gcash',
      'maribank',
      'bdo',
      'cash'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'payment_status') then
    create type public.payment_status as enum (
      'pending',
      'paid',
      'failed',
      'refunded'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'inventory_unit') then
    create type public.inventory_unit as enum ('g', 'kg', 'ml', 'l', 'pcs');
  end if;
end $$;

-- =========================================================
-- UPDATED_AT HELPER
-- =========================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =========================================================
-- CODE GENERATORS
-- =========================================================

create sequence if not exists public.customer_code_seq start 1;
create sequence if not exists public.menu_item_code_seq start 1;
create sequence if not exists public.ingredient_code_seq start 1;
create sequence if not exists public.inventory_item_code_seq start 1;
create sequence if not exists public.order_code_seq start 1;
create sequence if not exists public.import_batch_seq start 1;

create or replace function public.generate_customer_code()
returns text
language plpgsql
as $$
declare
  n bigint;
begin
  n := nextval('public.customer_code_seq');
  -- Example: HTC-000001
  return 'HTC-' || lpad(n::text, 6, '0');
end;
$$;

create or replace function public.generate_menu_item_code()
returns text
language plpgsql
as $$
declare
  n bigint;
begin
  n := nextval('public.menu_item_code_seq');
  return 'MI-' || lpad(n::text, 5, '0');
end;
$$;

create or replace function public.generate_ingredient_code()
returns text
language plpgsql
as $$
declare
  n bigint;
begin
  n := nextval('public.ingredient_code_seq');
  return 'ING-' || lpad(n::text, 5, '0');
end;
$$;

create or replace function public.generate_inventory_item_code()
returns text
language plpgsql
as $$
declare
  n bigint;
begin
  n := nextval('public.inventory_item_code_seq');
  return 'INV-' || lpad(n::text, 5, '0');
end;
$$;

create or replace function public.generate_order_code()
returns text
language plpgsql
as $$
declare
  n bigint;
begin
  n := nextval('public.order_code_seq');
  return 'ORD-' || lpad(n::text, 6, '0');
end;
$$;

create or replace function public.generate_import_batch_code()
returns text
language plpgsql
as $$
declare
  n bigint;
begin
  n := nextval('public.import_batch_seq');
  return 'IMP-' || lpad(n::text, 6, '0');
end;
$$;

-- =========================================================
-- PROFILES / USERS
-- auth.users is managed by Supabase Auth
-- =========================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null default 'customer',
  customer_code text unique,
  name text not null default '',
  email text not null default '',
  phone text not null default '',
  addresses jsonb not null default '[]'::jsonb,
  preferences jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_code_required_for_customers check (
    (role <> 'customer') or (customer_code is not null)
  )
);

create index if not exists idx_profiles_role on public.profiles(role);
create unique index if not exists idx_profiles_email_lower_unique
  on public.profiles (lower(trim(email)))
  where nullif(trim(email), '') is not null;
-- Compatibility cleanup:
-- profiles.customer_code is already indexed by its UNIQUE constraint.
-- Keep only one index definition to avoid duplicate write overhead.
do $$
begin
  if to_regclass('public.profiles_customer_code_key') is not null then
    execute 'drop index if exists public.idx_profiles_customer_code';
  end if;
end $$;

-- Keep the customer code sequence aligned with existing rows (safe to re-run).
do $$
declare
  max_suffix bigint;
  seq_last bigint;
  seq_called boolean;
begin
  select coalesce(max(substring(customer_code from '[0-9]+$')::bigint), 0)
    into max_suffix
  from public.profiles
  where customer_code like 'HTC-%';

  if max_suffix > 0 then
    select last_value, is_called into seq_last, seq_called
    from public.customer_code_seq;

    if seq_last < max_suffix or (seq_last = max_suffix and seq_called = false) then
      perform setval('public.customer_code_seq', max_suffix, true);
    end if;
  end if;
end $$;

-- =========================================================
-- ROLE HELPER FUNCTIONS (used by RLS + triggers)
-- =========================================================

create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_owner_or_staff()
returns boolean
language sql
stable
as $$
  select coalesce(public.current_app_role() in ('owner', 'staff'), false)
$$;

create or replace function public.is_owner()
returns boolean
language sql
stable
as $$
  select coalesce(public.current_app_role() = 'owner', false)
$$;

-- =========================================================
-- Auto-create profile row on signup
-- =========================================================

-- ADMIN NOTE: Promote users to staff/owner via a service-role / SQL editor update to public.profiles.role.
-- There is intentionally no public or client-side signup path for elevated roles.
create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  full_name text;
begin
  full_name := coalesce(new.raw_user_meta_data->>'name', '');

  -- SECURITY: never trust client-provided role metadata on public signup.
  -- All new users start as 'customer'. Elevated roles must be granted server-side
  -- (SQL editor / service role / explicit admin flow).

  insert into public.profiles (
    id,
    role,
    customer_code,
    name,
    email,
    phone
  )
  values (
    new.id,
    'customer'::public.app_role,
    public.generate_customer_code(),
    full_name,
    coalesce(new.email, ''),
    coalesce(new.phone, '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user_profile();

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute procedure public.set_updated_at();

-- Backfill profile rows for users created before this trigger existed.
insert into public.profiles (
  id,
  role,
  customer_code,
  name,
  email,
  phone
)
select
  au.id,
  'customer'::public.app_role,
  public.generate_customer_code(),
  coalesce(au.raw_user_meta_data->>'name', ''),
  coalesce(au.email, ''),
  coalesce(au.phone, '')
from auth.users au
left join public.profiles p on p.id = au.id
where p.id is null
on conflict (id) do nothing;

create or replace function public.customer_email_exists(p_email text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  v_email := lower(trim(coalesce(p_email, '')));
  if v_email = '' then
    return false;
  end if;

  return exists (
    select 1
    from auth.users au
    where lower(trim(coalesce(au.email, ''))) = v_email
  ) or exists (
    select 1
    from public.profiles p
    where lower(trim(coalesce(p.email, ''))) = v_email
  );
end;
$$;

grant execute on function public.customer_email_exists(text) to anon, authenticated;

-- Prevent customers/staff from escalating their own role via profile updates.
create or replace function public.prevent_profile_privilege_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Allow SQL editor / service operations (no JWT context).
  if auth.uid() is null then
    return new;
  end if;

  -- Only owners may change role / is_active for any profile.
  if (new.role is distinct from old.role) or (new.is_active is distinct from old.is_active) then
    if not public.is_owner() then
      raise exception 'Only owners may change roles or deactivate accounts.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_profiles_prevent_escalation on public.profiles;
create trigger trg_profiles_prevent_escalation
before update on public.profiles
for each row execute procedure public.prevent_profile_privilege_escalation();

-- =========================================================
-- BUSINESS SETTINGS (OWNER-MANAGED, PUBLICLY READABLE)
-- =========================================================

create table if not exists public.business_settings (
  id integer primary key default 1 check (id = 1),
  cafe_name text not null default 'Happy Tails Pet Cafe',
  business_hours text not null default E'Monday - Friday: 8:00 AM - 7:30 PM\nSaturday - Sunday: 8:00 AM - 8:00 PM',
  contact_number text not null default '0917 520 9713',
  business_email text not null default 'happytailspetcafe@gmail.com',
  cafe_address text not null default E'AMCJ Commercial Building, Bonifacio Drive, Pleasantville\nSubdivision, Phase 1, Ilayang Iyam, Lucena, Philippines, 4301',
  facebook_handle text not null default 'Happy Tails Pet Cafe - Lucena',
  instagram_handle text not null default '@happytailspetcafelc',
  logo_url text,
  enable_qrph boolean not null default true,
  enable_gcash boolean not null default true,
  enable_maribank boolean not null default true,
  enable_bdo boolean not null default true,
  enable_cash boolean not null default true,
  enable_dine_in boolean not null default true,
  enable_pickup boolean not null default true,
  enable_takeout boolean not null default true,
  enable_delivery boolean not null default false,
  delivery_radius_km numeric(8,2) not null default 4 check (delivery_radius_km >= 0),
  service_fee_pct numeric(5,2) not null default 5 check (service_fee_pct >= 0),
  tax_pct numeric(5,2) not null default 12 check (tax_pct >= 0),
  kitchen_cutoff text not null default '20:30',
  campaign_announcements jsonb not null default '[]'::jsonb,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.business_settings add column if not exists enable_qrph boolean not null default true;
alter table public.business_settings add column if not exists enable_gcash boolean not null default true;
alter table public.business_settings add column if not exists enable_maribank boolean not null default true;
alter table public.business_settings add column if not exists enable_bdo boolean not null default true;
alter table public.business_settings add column if not exists enable_cash boolean not null default true;
alter table public.business_settings add column if not exists enable_dine_in boolean not null default true;
alter table public.business_settings add column if not exists enable_pickup boolean not null default true;
alter table public.business_settings add column if not exists enable_takeout boolean not null default true;
alter table public.business_settings add column if not exists enable_delivery boolean not null default false;
alter table public.business_settings add column if not exists delivery_radius_km numeric(8,2) not null default 4;
alter table public.business_settings add column if not exists service_fee_pct numeric(5,2) not null default 5;
alter table public.business_settings add column if not exists tax_pct numeric(5,2) not null default 12;
alter table public.business_settings add column if not exists kitchen_cutoff text not null default '20:30';
alter table public.business_settings add column if not exists campaign_announcements jsonb not null default '[]'::jsonb;

drop trigger if exists trg_business_settings_updated_at on public.business_settings;
create trigger trg_business_settings_updated_at
before update on public.business_settings
for each row execute procedure public.set_updated_at();

insert into public.business_settings (
  id,
  cafe_name,
  business_hours,
  contact_number,
  business_email,
  cafe_address,
  facebook_handle,
  instagram_handle
)
values (
  1,
  'Happy Tails Pet Cafe',
  E'Monday - Friday: 8:00 AM - 7:30 PM\nSaturday - Sunday: 8:00 AM - 8:00 PM',
  '0917 520 9713',
  'happytailspetcafe@gmail.com',
  E'AMCJ Commercial Building, Bonifacio Drive, Pleasantville\nSubdivision, Phase 1, Ilayang Iyam, Lucena, Philippines, 4301',
  'Happy Tails Pet Cafe - Lucena',
  '@happytailspetcafelc'
)
on conflict (id) do nothing;

-- =========================================================
-- LOGIN HISTORY
-- =========================================================

create table if not exists public.login_history (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete set null,
  email text,
  role public.app_role,
  success boolean not null default true,
  device text,
  ip_address inet,
  user_agent text,
  logged_in_at timestamptz not null default now(),
  logged_out_at timestamptz
);

create index if not exists idx_login_history_profile_id on public.login_history(profile_id);
create index if not exists idx_login_history_logged_in_at on public.login_history(logged_in_at desc);
create index if not exists idx_login_history_profile_logged_in_at on public.login_history(profile_id, logged_in_at desc);

-- Only allow non-staff users to set logged_out_at on their own login row.
create or replace function public.enforce_login_history_update_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Allow SQL editor / service operations (no JWT context).
  if auth.uid() is null then
    return new;
  end if;

  -- Staff/owner can manage login history freely (still governed by RLS).
  if public.is_owner_or_staff() then
    return new;
  end if;

  if old.profile_id is distinct from auth.uid() then
    raise exception 'You can only update your own login history.';
  end if;

  -- Non-staff users may only set logged_out_at once.
  if new.logged_out_at is distinct from old.logged_out_at then
    if old.logged_out_at is not null then
      raise exception 'Logout time is already set.';
    end if;

    -- Prevent tampering with all other columns.
    new.profile_id := old.profile_id;
    new.email := old.email;
    new.role := old.role;
    new.success := old.success;
    new.device := old.device;
    new.ip_address := old.ip_address;
    new.user_agent := old.user_agent;
    new.logged_in_at := old.logged_in_at;
    return new;
  end if;

  raise exception 'Only logout time may be updated.';
end;
$$;

drop trigger if exists trg_login_history_enforce_update_rules on public.login_history;
create trigger trg_login_history_enforce_update_rules
before update on public.login_history
for each row execute procedure public.enforce_login_history_update_rules();

-- =========================================================
-- ACTIVITY LOGS (OWNER/STAFF AUDIT TRAIL)
-- =========================================================

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  actor_role public.app_role,
  action text not null,
  entity_type text not null,
  entity_id text,
  entity_label text,
  details text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists idx_activity_logs_occurred_at on public.activity_logs(occurred_at desc);
create index if not exists idx_activity_logs_actor_id on public.activity_logs(actor_id);
create index if not exists idx_activity_logs_entity_type_occurred_at on public.activity_logs(entity_type, occurred_at desc);

create or replace function public.record_activity_log(
  p_action text,
  p_entity_type text,
  p_entity_id text default null,
  p_entity_label text default null,
  p_details text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_actor_id uuid default auth.uid()
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_actor_id uuid := coalesce(p_actor_id, auth.uid());
  resolved_actor_role public.app_role;
begin
  if resolved_actor_id is not null then
    select p.role
    into resolved_actor_role
    from public.profiles p
    where p.id = resolved_actor_id;
  end if;

  insert into public.activity_logs (
    actor_id,
    actor_role,
    action,
    entity_type,
    entity_id,
    entity_label,
    details,
    metadata,
    occurred_at
  )
  values (
    resolved_actor_id,
    resolved_actor_role,
    coalesce(nullif(trim(p_action), ''), 'Activity event'),
    coalesce(nullif(trim(p_entity_type), ''), 'system'),
    nullif(trim(p_entity_id), ''),
    nullif(trim(p_entity_label), ''),
    nullif(trim(p_details), ''),
    coalesce(p_metadata, '{}'::jsonb),
    now()
  );
exception
  when others then
    -- Best-effort audit trail. Never block the main data write.
    null;
end;
$$;

create or replace function public.log_table_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  row_id text;
  row_label text;
  action_label text;
  details_text text;
  metadata_payload jsonb;
  changed_columns text[];
begin
  if tg_op = 'INSERT' then
    row_id := nullif(coalesce(to_jsonb(new)->>'id', ''), '');
    row_label := nullif(trim(coalesce(to_jsonb(new)->>'code', to_jsonb(new)->>'name', row_id, tg_table_name)), '');

    action_label := case tg_table_name
      when 'inventory_items' then 'Created inventory item'
      when 'inventory_categories' then 'Created inventory category'
      when 'menu_items' then 'Created menu item'
      when 'menu_categories' then 'Created menu category'
      when 'daily_menus' then 'Created daily menu'
      when 'loyalty_rewards' then 'Created loyalty reward'
      else 'Created record'
    end;

    metadata_payload := jsonb_build_object('operation', tg_op, 'table', tg_table_name);
    perform public.record_activity_log(action_label, tg_table_name, row_id, row_label, null, metadata_payload, actor_id);
    return new;
  end if;

  if tg_op = 'UPDATE' then
    row_id := nullif(coalesce(to_jsonb(new)->>'id', to_jsonb(old)->>'id', ''), '');
    row_label := nullif(trim(coalesce(to_jsonb(new)->>'code', to_jsonb(new)->>'name', to_jsonb(old)->>'code', to_jsonb(old)->>'name', row_id, tg_table_name)), '');

    select coalesce(array_agg(keys.key order by keys.key), '{}')
    into changed_columns
    from jsonb_object_keys(to_jsonb(new)) as keys(key)
    where keys.key not in ('updated_at')
      and (to_jsonb(new)->keys.key) is distinct from (to_jsonb(old)->keys.key);

    if coalesce(array_length(changed_columns, 1), 0) = 0 then
      return new;
    end if;

    action_label := case tg_table_name
      when 'inventory_items' then 'Updated inventory item'
      when 'inventory_categories' then 'Updated inventory category'
      when 'menu_items' then 'Updated menu item'
      when 'menu_categories' then 'Updated menu category'
      when 'daily_menus' then 'Updated daily menu'
      when 'loyalty_rewards' then 'Updated loyalty reward'
      else 'Updated record'
    end;
    details_text := 'Changed: ' || array_to_string(changed_columns, ', ');
    metadata_payload := jsonb_build_object(
      'operation', tg_op,
      'table', tg_table_name,
      'changed_fields', to_jsonb(changed_columns)
    );

    perform public.record_activity_log(action_label, tg_table_name, row_id, row_label, details_text, metadata_payload, actor_id);
    return new;
  end if;

  if tg_op = 'DELETE' then
    row_id := nullif(coalesce(to_jsonb(old)->>'id', ''), '');
    row_label := nullif(trim(coalesce(to_jsonb(old)->>'code', to_jsonb(old)->>'name', row_id, tg_table_name)), '');

    action_label := case tg_table_name
      when 'inventory_items' then 'Deleted inventory item'
      when 'inventory_categories' then 'Deleted inventory category'
      when 'menu_items' then 'Deleted menu item'
      when 'menu_categories' then 'Deleted menu category'
      when 'daily_menus' then 'Deleted daily menu'
      when 'loyalty_rewards' then 'Deleted loyalty reward'
      else 'Deleted record'
    end;
    metadata_payload := jsonb_build_object('operation', tg_op, 'table', tg_table_name);
    perform public.record_activity_log(action_label, tg_table_name, row_id, row_label, null, metadata_payload, actor_id);
    return old;
  end if;

  return coalesce(new, old);
end;
$$;

-- =========================================================
-- MENU
-- =========================================================

create table if not exists public.menu_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  image_url text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  new_tag_started_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.menu_categories add column if not exists description text;
alter table public.menu_categories add column if not exists image_url text;
alter table public.menu_categories add column if not exists new_tag_started_at timestamptz;

drop trigger if exists trg_menu_categories_updated_at on public.menu_categories;
create trigger trg_menu_categories_updated_at
before update on public.menu_categories
for each row execute procedure public.set_updated_at();

create table if not exists public.menu_items (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default public.generate_menu_item_code(),
  category_id uuid not null references public.menu_categories(id) on delete restrict,
  name text not null,
  description text,
  price numeric(10,2) not null check (price >= 0),
  cost numeric(10,2) not null default 0 check (cost >= 0),
  discount numeric(10,2) not null default 0 check (discount >= 0),
  discount_type text not null default 'amount' check (discount_type in ('amount', 'percent')),
  discount_value numeric(10,2) not null default 0 check (discount_value >= 0),
  discount_starts_at timestamptz,
  discount_ends_at timestamptz,
  limited_time_ends_at timestamptz,
  is_available boolean not null default true,
  new_tag_started_at timestamptz,
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(category_id, name)
);

alter table public.menu_items add column if not exists discount_type text not null default 'amount';
alter table public.menu_items add column if not exists discount_value numeric(10,2) not null default 0;
alter table public.menu_items add column if not exists cost numeric(10,2) not null default 0;
alter table public.menu_items add column if not exists discount_starts_at timestamptz;
alter table public.menu_items add column if not exists discount_ends_at timestamptz;
alter table public.menu_items add column if not exists limited_time_ends_at timestamptz;
alter table public.menu_items add column if not exists new_tag_started_at timestamptz;

alter table public.menu_items alter column discount_type set default 'amount';
alter table public.menu_items alter column discount_value set default 0;
alter table public.menu_items alter column cost set default 0;

update public.menu_items
set
  discount_type = 'amount',
  discount_value = coalesce(discount, 0)
where coalesce(discount, 0) > 0
  and coalesce(discount_value, 0) = 0;

update public.menu_items
set discount_type = 'amount'
where discount_type is null
  or discount_type not in ('amount', 'percent');

update public.menu_items
set discount_value = 0
where discount_value is null
  or discount_value < 0;

update public.menu_items
set cost = 0
where cost is null
  or cost < 0;

alter table public.menu_items alter column discount_type set not null;
alter table public.menu_items alter column discount_value set not null;
alter table public.menu_items alter column cost set not null;

create index if not exists idx_menu_items_category_id on public.menu_items(category_id);
create index if not exists idx_menu_items_is_available on public.menu_items(is_available);
create index if not exists idx_menu_items_name_trgm on public.menu_items using gin (name gin_trgm_ops);
create index if not exists idx_menu_items_discount_window on public.menu_items(discount_starts_at, discount_ends_at);
create index if not exists idx_menu_items_limited_time_ends_at on public.menu_items(limited_time_ends_at);
create index if not exists idx_menu_items_new_tag_started_at on public.menu_items(new_tag_started_at);
create index if not exists idx_menu_categories_new_tag_started_at on public.menu_categories(new_tag_started_at);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'menu_items_discount_type_chk'
      and conrelid = 'public.menu_items'::regclass
  ) then
    alter table public.menu_items
      add constraint menu_items_discount_type_chk
      check (discount_type in ('amount', 'percent'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'menu_items_cost_chk'
      and conrelid = 'public.menu_items'::regclass
  ) then
    alter table public.menu_items
      add constraint menu_items_cost_chk
      check (cost >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'menu_items_discount_value_chk'
      and conrelid = 'public.menu_items'::regclass
  ) then
    alter table public.menu_items
      add constraint menu_items_discount_value_chk
      check (discount_value >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'menu_items_discount_window_chk'
      and conrelid = 'public.menu_items'::regclass
  ) then
    alter table public.menu_items
      add constraint menu_items_discount_window_chk
      check (
        discount_ends_at is null
        or discount_starts_at is null
        or discount_ends_at > discount_starts_at
      );
  end if;
end
$$;
-- Compatibility cleanup:
-- menu_items.code already has a UNIQUE index via table constraint.
do $$
begin
  if to_regclass('public.menu_items_code_key') is not null then
    execute 'drop index if exists public.idx_menu_items_code';
  end if;
end $$;

drop trigger if exists trg_menu_items_updated_at on public.menu_items;
create trigger trg_menu_items_updated_at
before update on public.menu_items
for each row execute procedure public.set_updated_at();

create or replace function public.set_menu_category_new_tag_started_at()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE'
    and coalesce(old.is_active, true) = false
    and coalesce(new.is_active, true) = true
  then
    new.new_tag_started_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_menu_categories_new_tag_started_at on public.menu_categories;
create trigger trg_menu_categories_new_tag_started_at
before update on public.menu_categories
for each row execute procedure public.set_menu_category_new_tag_started_at();

create or replace function public.set_menu_item_new_tag_started_at()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE'
    and coalesce(old.is_available, true) = false
    and coalesce(new.is_available, true) = true
  then
    new.new_tag_started_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_menu_items_new_tag_started_at on public.menu_items;
create trigger trg_menu_items_new_tag_started_at
before update on public.menu_items
for each row execute procedure public.set_menu_item_new_tag_started_at();

create or replace function public.menu_tag_is_new(
  p_new_tag_started_at timestamptz
)
returns boolean
language sql
stable
as $$
  select
    p_new_tag_started_at is not null
    and p_new_tag_started_at <= now()
    and p_new_tag_started_at > now() - interval '7 days';
$$;

create or replace function public.menu_effective_discount(
  p_discount numeric,
  p_discount_starts_at timestamptz,
  p_discount_ends_at timestamptz,
  p_price numeric
)
returns numeric
language sql
stable
as $$
  select
    round(
      case
        when coalesce(p_discount, 0) <= 0 then 0::numeric
        when p_discount_starts_at is not null and p_discount_starts_at > now() then 0::numeric
        when p_discount_ends_at is not null and p_discount_ends_at <= now() then 0::numeric
        else least(greatest(coalesce(p_discount, 0), 0), greatest(coalesce(p_price, 0), 0))
      end,
      2
    );
$$;

create or replace function public.menu_item_is_limited_expired(
  p_limited_time_ends_at timestamptz
)
returns boolean
language sql
stable
as $$
  select p_limited_time_ends_at is not null and p_limited_time_ends_at <= now();
$$;

-- =========================================================
-- LEGACY INGREDIENT-BASED INVENTORY (BACKWARD COMPATIBILITY)
-- =========================================================

create table if not exists public.ingredients (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default public.generate_ingredient_code(),
  name text not null unique,
  unit public.inventory_unit not null,
  stock_on_hand numeric(12,3) not null default 0 check (stock_on_hand >= 0),
  reorder_level numeric(12,3) not null default 0 check (reorder_level >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_ingredients_updated_at on public.ingredients;
create trigger trg_ingredients_updated_at
before update on public.ingredients
for each row execute procedure public.set_updated_at();

create table if not exists public.menu_item_recipe_lines (
  id uuid primary key default gen_random_uuid(),
  menu_item_id uuid not null references public.menu_items(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete restrict,
  quantity_required numeric(12,3) not null check (quantity_required > 0),
  created_at timestamptz not null default now(),
  unique(menu_item_id, ingredient_id)
);

create index if not exists idx_recipe_menu_item_id on public.menu_item_recipe_lines(menu_item_id);
create index if not exists idx_recipe_ingredient_id on public.menu_item_recipe_lines(ingredient_id);

-- Legacy movement tables are intentionally preserved in this unified schema.
-- Rationale:
-- 1) avoid destructive drops during reruns
-- 2) keep compatibility for existing databases that may still retain historical rows
-- 3) allow explicit/manual retirement in a separate, audited migration

-- =========================================================
-- CATEGORIZED INVENTORY TRACKER (CURRENT)
-- =========================================================

create table if not exists public.inventory_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_inventory_categories_updated_at on public.inventory_categories;
create trigger trg_inventory_categories_updated_at
before update on public.inventory_categories
for each row execute procedure public.set_updated_at();

create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default public.generate_inventory_item_code(),
  category_id uuid not null references public.inventory_categories(id) on delete restrict,
  name text not null,
  unit text not null default 'pcs',
  quantity_on_hand numeric(12,3) not null default 0 check (quantity_on_hand >= 0),
  reorder_level numeric(12,3) not null default 0 check (reorder_level >= 0),
  display_quantity text,
  notes text,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(category_id, name)
);

drop trigger if exists trg_inventory_items_updated_at on public.inventory_items;
create trigger trg_inventory_items_updated_at
before update on public.inventory_items
for each row execute procedure public.set_updated_at();

create index if not exists idx_inventory_items_category_id on public.inventory_items(category_id);
create index if not exists idx_inventory_items_is_active on public.inventory_items(is_active);
create index if not exists idx_inventory_items_quantity_on_hand on public.inventory_items(quantity_on_hand);
-- Compatibility cleanup:
-- inventory_items.code already has a UNIQUE index via table constraint.
do $$
begin
  if to_regclass('public.inventory_items_code_key') is not null then
    execute 'drop index if exists public.idx_inventory_items_code';
  end if;
end $$;

-- =========================================================
-- DAILY MENU
-- =========================================================

create table if not exists public.daily_menus (
  id uuid primary key default gen_random_uuid(),
  menu_date date not null unique,
  is_published boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_daily_menus_updated_at on public.daily_menus;
create trigger trg_daily_menus_updated_at
before update on public.daily_menus
for each row execute procedure public.set_updated_at();

create table if not exists public.daily_menu_items (
  id uuid primary key default gen_random_uuid(),
  daily_menu_id uuid not null references public.daily_menus(id) on delete cascade,
  menu_item_id uuid not null references public.menu_items(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(daily_menu_id, menu_item_id)
);

create index if not exists idx_daily_menu_items_daily_menu_id on public.daily_menu_items(daily_menu_id);
create index if not exists idx_daily_menus_menu_date_published on public.daily_menus(menu_date, is_published);

-- =========================================================
-- HOMEPAGE CAMPAIGN ANNOUNCEMENTS
-- =========================================================

create table if not exists public.campaign_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  message text not null,
  cta_text text,
  cta_link text,
  is_active boolean not null default true,
  start_at timestamptz,
  end_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_at is null or end_at is null or end_at >= start_at)
);

drop trigger if exists trg_campaign_announcements_updated_at on public.campaign_announcements;
create trigger trg_campaign_announcements_updated_at
before update on public.campaign_announcements
for each row execute procedure public.set_updated_at();

create index if not exists idx_campaign_announcements_active_window
  on public.campaign_announcements(is_active, start_at, end_at);

-- =========================================================
-- LOYALTY
-- =========================================================

create table if not exists public.loyalty_accounts (
  customer_id uuid primary key references public.profiles(id) on delete cascade,
  stamp_count integer not null default 0 check (stamp_count >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.loyalty_rewards (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  required_stamps integer not null check (required_stamps > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.loyalty_redemptions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  reward_id uuid not null references public.loyalty_rewards(id) on delete restrict,
  redeemed_at timestamptz not null default now(),
  notes text
);

create index if not exists idx_loyalty_redemptions_customer_id on public.loyalty_redemptions(customer_id);
create index if not exists idx_loyalty_redemptions_customer_redeemed_at on public.loyalty_redemptions(customer_id, redeemed_at desc);
create index if not exists idx_loyalty_rewards_active_required_stamps on public.loyalty_rewards(is_active, required_stamps);

create or replace function public.loyalty_free_latte_option_for_item_name(p_name text)
returns text
language plpgsql
immutable
as $$
declare
  v_name text;
begin
  v_name := lower(trim(coalesce(p_name, '')));

  if v_name = 'cafe latte' then
    return 'Cafe Latte';
  end if;

  if v_name in ('matcha latte', 'iced matcha latte') then
    return 'Matcha Latte';
  end if;

  if v_name = 'spanish latte' then
    return 'Spanish Latte';
  end if;

  return null;
end;
$$;

create or replace function public.touch_loyalty_account_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_loyalty_accounts_updated_at on public.loyalty_accounts;
create trigger trg_loyalty_accounts_updated_at
before update on public.loyalty_accounts
for each row execute procedure public.touch_loyalty_account_updated_at();

-- =========================================================
-- ORDERS
-- =========================================================

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default public.generate_order_code(),
  customer_id uuid references public.profiles(id) on delete set null,
  order_type public.order_type not null,
  status public.order_status not null default 'pending',
  payment_method public.payment_method,
  payment_status public.payment_status not null default 'pending',
  subtotal numeric(10,2) not null default 0 check (subtotal >= 0),
  discount_total numeric(10,2) not null default 0 check (discount_total >= 0),
  total_amount numeric(10,2) not null default 0 check (total_amount >= 0),
  receipt_image_url text,
  notes text,
  delivery_address jsonb,
  placed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_orders_customer_id on public.orders(customer_id);
create index if not exists idx_orders_status on public.orders(status);
create index if not exists idx_orders_payment_status on public.orders(payment_status);
create index if not exists idx_orders_created_at on public.orders(created_at desc);
create index if not exists idx_orders_placed_at on public.orders(placed_at desc);
create index if not exists idx_orders_customer_placed_at on public.orders(customer_id, placed_at desc);
create index if not exists idx_orders_status_placed_at on public.orders(status, placed_at desc);
create index if not exists idx_orders_payment_method_placed_at on public.orders(payment_method, placed_at desc);
create index if not exists idx_orders_code_trgm on public.orders using gin (code gin_trgm_ops);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_receipt_required_for_non_cash'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
    add constraint orders_receipt_required_for_non_cash
    check (
      payment_method is null
      or payment_method = 'cash'
      or nullif(trim(coalesce(receipt_image_url, '')), '') is not null
    );
  end if;
end $$;

drop trigger if exists trg_orders_updated_at on public.orders;
create trigger trg_orders_updated_at
before update on public.orders
for each row execute procedure public.set_updated_at();

create table if not exists public.loyalty_reward_items (
  id uuid primary key default gen_random_uuid(),
  redemption_id uuid not null unique references public.loyalty_redemptions(id) on delete cascade,
  customer_id uuid not null references public.profiles(id) on delete cascade,
  reward_id uuid not null references public.loyalty_rewards(id) on delete restrict,
  menu_item_id uuid not null references public.menu_items(id) on delete restrict,
  menu_item_code text not null,
  item_name text not null,
  option_label text,
  status text not null default 'pending' check (status in ('pending', 'claimed')),
  claimed_order_id uuid references public.orders(id) on delete set null,
  claimed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loyalty_reward_items_claim_state_check check (
    (status = 'pending' and claimed_order_id is null and claimed_at is null)
    or (status = 'claimed' and claimed_order_id is not null and claimed_at is not null)
  )
);

create index if not exists idx_loyalty_reward_items_customer_status
  on public.loyalty_reward_items(customer_id, status, created_at desc);
create index if not exists idx_loyalty_reward_items_claimed_order_id
  on public.loyalty_reward_items(claimed_order_id)
  where claimed_order_id is not null;
create index if not exists idx_loyalty_reward_items_menu_item_id
  on public.loyalty_reward_items(menu_item_id);

drop trigger if exists trg_loyalty_reward_items_updated_at on public.loyalty_reward_items;
create trigger trg_loyalty_reward_items_updated_at
before update on public.loyalty_reward_items
for each row execute procedure public.set_updated_at();

create or replace function public.claim_loyalty_reward_items_for_order(
  p_order_id uuid,
  p_reward_item_ids uuid[],
  p_claimed_at timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_expected_count integer;
  v_claimed_count integer;
begin
  v_customer_id := auth.uid();
  if v_customer_id is null then
    raise exception 'Authentication required.';
  end if;

  if p_order_id is null then
    raise exception 'Order ID is required to claim loyalty reward items.';
  end if;

  if exists (
    select 1
    from unnest(coalesce(p_reward_item_ids, '{}'::uuid[])) as reward_item_id
    group by reward_item_id
    having count(*) > 1
  ) then
    raise exception 'Each loyalty reward item can only be used once per order.';
  end if;

  select coalesce(count(*), 0)
  into v_expected_count
  from (
    select distinct reward_item_id
    from unnest(coalesce(p_reward_item_ids, '{}'::uuid[])) as reward_item_id
    where reward_item_id is not null
  ) deduped;

  if v_expected_count = 0 then
    return 0;
  end if;

  if not exists (
    select 1
    from public.orders o
    where o.id = p_order_id
      and o.customer_id = v_customer_id
  ) then
    raise exception 'Order not found for loyalty reward claim.';
  end if;

  update public.loyalty_reward_items lri
  set
    status = 'claimed',
    claimed_order_id = p_order_id,
    claimed_at = coalesce(p_claimed_at, now()),
    updated_at = now()
  where lri.id = any(coalesce(p_reward_item_ids, '{}'::uuid[]))
    and lri.customer_id = v_customer_id
    and lri.status = 'pending'
    and lri.claimed_order_id is null
    and exists (
      select 1
      from public.order_items oi
      where oi.order_id = p_order_id
        and oi.menu_item_id = lri.menu_item_id
        and greatest(coalesce(oi.unit_price, 0) - coalesce(oi.discount_amount, 0), 0) = 0
    );

  get diagnostics v_claimed_count = row_count;

  if v_claimed_count <> v_expected_count then
    raise exception 'Invalid loyalty reward items payload.';
  end if;

  return v_claimed_count;
end;
$$;

-- Transactional order creation for customers: ensures orders, items, and initial history are written atomically.
create or replace function public.create_customer_order(
  p_order_type public.order_type,
  p_payment_method public.payment_method,
  p_subtotal numeric,
  p_discount_total numeric,
  p_total_amount numeric,
  p_items jsonb,
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
  v_payload_total_amount := round(coalesce(p_total_amount, 0)::numeric, 2);

  if v_payload_subtotal < 0
    or v_payload_discount_total < 0
    or v_payload_total_amount < 0
  then
    raise exception 'Order totals cannot be negative.';
  end if;

  if v_payload_discount_total > v_payload_subtotal then
    raise exception 'Discount total cannot exceed subtotal.';
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
  ) then
    if p_order_type not in ('dine_in', 'pickup', 'takeout') then
      raise exception 'Free latte rewards can only be claimed with pickup, dine-in, or takeout orders.';
    end if;

    if not exists (
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
      where x.loyalty_reward_item_id is null
    ) then
      raise exception 'Free latte rewards must be claimed with a regular menu order.';
    end if;
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
      )::numeric,
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
    p_delivery_address,
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

-- Allow customer cancellation safely (status only, and only while pending).
create or replace function public.enforce_order_update_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Allow SQL editor / service operations (no JWT context).
  if auth.uid() is null then
    return new;
  end if;

  -- Staff/owner can manage orders freely (still governed by RLS).
  if public.is_owner_or_staff() then
    return new;
  end if;

  -- Customers may only cancel their own order while status is still pending.
  if old.customer_id is distinct from auth.uid() then
    raise exception 'You can only update your own orders.';
  end if;

  if new.status is distinct from old.status then
    if old.status = 'pending'
      and new.status = 'cancelled'
    then
      -- Prevent tampering with anything except status (+ updated_at via trigger).
      new.code := old.code;
      new.customer_id := old.customer_id;
      new.order_type := old.order_type;
      new.payment_method := old.payment_method;
      new.payment_status := old.payment_status;
      new.subtotal := old.subtotal;
      new.discount_total := old.discount_total;
      new.total_amount := old.total_amount;
      new.receipt_image_url := old.receipt_image_url;
      new.notes := old.notes;
      new.delivery_address := old.delivery_address;
      new.placed_at := old.placed_at;
      new.created_at := old.created_at;
      return new;
    end if;
  end if;

  raise exception 'Customers can only cancel while order status is pending.';
end;
$$;

drop trigger if exists trg_orders_enforce_update_rules on public.orders;
create trigger trg_orders_enforce_update_rules
before update on public.orders
for each row execute procedure public.enforce_order_update_rules();

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  menu_item_id uuid references public.menu_items(id) on delete set null,
  menu_item_code text,
  item_name text not null,
  unit_price numeric(10,2) not null check (unit_price >= 0),
  discount_amount numeric(10,2) not null default 0 check (discount_amount >= 0),
  quantity integer not null check (quantity > 0),
  line_total numeric(10,2) not null check (line_total >= 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_order_items_order_id on public.order_items(order_id);
create index if not exists idx_order_items_menu_item_id on public.order_items(menu_item_id);

create table if not exists public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  status public.order_status not null,
  changed_by uuid references public.profiles(id) on delete set null,
  note text,
  changed_at timestamptz not null default now()
);

create index if not exists idx_order_status_history_order_id on public.order_status_history(order_id);
create index if not exists idx_order_status_history_changed_at on public.order_status_history(changed_at desc);
create index if not exists idx_order_status_history_order_changed_at on public.order_status_history(order_id, changed_at desc);

create or replace function public.release_loyalty_reward_items_for_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status is distinct from new.status
    and new.status in ('cancelled', 'refunded')
  then
    update public.loyalty_reward_items
    set
      status = 'pending',
      claimed_order_id = null,
      claimed_at = null,
      updated_at = now()
    where claimed_order_id = new.id
      and status = 'claimed';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_orders_release_loyalty_reward_items on public.orders;
create trigger trg_orders_release_loyalty_reward_items
after update of status on public.orders
for each row execute procedure public.release_loyalty_reward_items_for_order();

create table if not exists public.loyalty_stamp_events (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  order_id uuid unique references public.orders(id) on delete cascade,
  stamp_delta integer not null default 1 check (stamp_delta > 0),
  source text not null default 'order_completion',
  reason text,
  earned_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.loyalty_stamp_events alter column order_id drop not null;
alter table public.loyalty_stamp_events add column if not exists reason text;

do $$
begin
  alter table public.loyalty_stamp_events drop constraint if exists loyalty_stamp_events_stamp_delta_check;
  alter table public.loyalty_stamp_events
    add constraint loyalty_stamp_events_stamp_delta_check check (stamp_delta > 0);
end $$;

create index if not exists idx_loyalty_stamp_events_customer_id on public.loyalty_stamp_events(customer_id);
create index if not exists idx_loyalty_stamp_events_earned_at on public.loyalty_stamp_events(earned_at desc);
create index if not exists idx_loyalty_stamp_events_customer_earned_at on public.loyalty_stamp_events(customer_id, earned_at desc);

create or replace function public.award_loyalty_stamp_for_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted_customer_id uuid;
begin
  if new.customer_id is null then
    return new;
  end if;

  if new.status not in ('completed', 'delivered') then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status in ('completed', 'delivered') then
    return new;
  end if;

  insert into public.loyalty_stamp_events (
    customer_id,
    order_id,
    stamp_delta,
    source,
    earned_at
  )
  values (
    new.customer_id,
    new.id,
    1,
    'order_completion',
    coalesce(new.updated_at, new.placed_at, new.created_at, now())
  )
  on conflict (order_id) do nothing
  returning customer_id into v_inserted_customer_id;

  if v_inserted_customer_id is not null then
    insert into public.loyalty_accounts (customer_id, stamp_count, updated_at)
    values (v_inserted_customer_id, 1, now())
    on conflict (customer_id) do update
      set stamp_count = public.loyalty_accounts.stamp_count + 1,
          updated_at = now();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_orders_award_loyalty_stamp on public.orders;
create trigger trg_orders_award_loyalty_stamp
after insert or update of status on public.orders
for each row execute procedure public.award_loyalty_stamp_for_order();

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
    'order_completion_backfill',
    coalesce(o.updated_at, o.placed_at, o.created_at, now())
  from public.orders o
  where o.customer_id is not null
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

create or replace function public.award_manual_loyalty_stamps(
  p_customer_id uuid,
  p_stamp_count integer,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_role public.app_role;
  v_customer public.profiles%rowtype;
  v_stamp_count integer;
  v_reason text;
  v_event public.loyalty_stamp_events%rowtype;
  v_new_stamp_count integer;
  v_customer_label text;
begin
  if v_actor_id is null then
    raise exception 'Authentication required.';
  end if;

  select p.role
  into v_actor_role
  from public.profiles p
  where p.id = v_actor_id;

  if coalesce(v_actor_role::text, '') not in ('owner', 'staff') then
    raise exception 'Only owner or staff can award loyalty stamps.';
  end if;

  v_stamp_count := coalesce(p_stamp_count, 0);
  if v_stamp_count < 1 or v_stamp_count > 50 then
    raise exception 'Stamp count must be between 1 and 50.';
  end if;

  select *
  into v_customer
  from public.profiles
  where id = p_customer_id
    and role = 'customer'
    and is_active = true
  limit 1;

  if not found then
    raise exception 'Customer not found.';
  end if;

  v_reason := nullif(trim(coalesce(p_reason, '')), '');
  v_customer_label := coalesce(nullif(trim(v_customer.name), ''), nullif(trim(v_customer.email), ''), v_customer.id::text);

  insert into public.loyalty_stamp_events (
    customer_id,
    order_id,
    stamp_delta,
    source,
    reason,
    earned_at
  )
  values (
    v_customer.id,
    null,
    v_stamp_count,
    'manual_staff_award',
    v_reason,
    now()
  )
  returning * into v_event;

  insert into public.loyalty_accounts (customer_id, stamp_count, updated_at)
  values (v_customer.id, v_stamp_count, now())
  on conflict (customer_id) do update
    set stamp_count = public.loyalty_accounts.stamp_count + excluded.stamp_count,
        updated_at = now()
  returning stamp_count into v_new_stamp_count;

  perform public.record_activity_log(
    'Awarded loyalty stamps',
    'loyalty_stamp_events',
    v_event.id::text,
    v_customer_label,
    format(
      'Awarded %s stamp%s to %s%s',
      v_stamp_count,
      case when v_stamp_count = 1 then '' else 's' end,
      v_customer_label,
      case when v_reason is not null then '. Reason: ' || v_reason else '.' end
    ),
    jsonb_build_object(
      'customer_id', v_customer.id,
      'stamp_delta', v_stamp_count,
      'source', 'manual_staff_award',
      'reason', v_reason,
      'new_stamp_count', v_new_stamp_count
    ),
    v_actor_id
  );

  return jsonb_build_object(
    'eventId', v_event.id,
    'customerId', v_customer.id,
    'customerLabel', v_customer_label,
    'stampDelta', v_stamp_count,
    'newStampCount', v_new_stamp_count,
    'reason', v_reason,
    'awardedAt', v_event.earned_at
  );
end;
$$;

grant execute on function public.award_manual_loyalty_stamps(uuid, integer, text) to authenticated;

create or replace function public.reset_customer_loyalty_card(
  p_customer_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_role public.app_role;
  v_customer public.profiles%rowtype;
  v_previous_stamp_count integer;
  v_new_stamp_count integer;
  v_reason text;
  v_customer_label text;
begin
  if v_actor_id is null then
    raise exception 'Authentication required.';
  end if;

  select p.role
  into v_actor_role
  from public.profiles p
  where p.id = v_actor_id;

  if coalesce(v_actor_role::text, '') not in ('owner', 'staff') then
    raise exception 'Only owner or staff can reset loyalty cards.';
  end if;

  select *
  into v_customer
  from public.profiles
  where id = p_customer_id
    and role = 'customer'
    and is_active = true
  limit 1;

  if not found then
    raise exception 'Customer not found.';
  end if;

  select coalesce((
    select la.stamp_count
    from public.loyalty_accounts la
    where la.customer_id = v_customer.id
  ), 0)
  into v_previous_stamp_count;

  v_reason := nullif(trim(coalesce(p_reason, '')), '');
  v_customer_label := coalesce(nullif(trim(v_customer.name), ''), nullif(trim(v_customer.email), ''), v_customer.id::text);

  insert into public.loyalty_accounts (customer_id, stamp_count, updated_at)
  values (v_customer.id, 0, now())
  on conflict (customer_id) do update
    set stamp_count = 0,
        updated_at = now()
  returning stamp_count into v_new_stamp_count;

  perform public.record_activity_log(
    'Reset loyalty card',
    'loyalty_accounts',
    v_customer.id::text,
    v_customer_label,
    format(
      'Reset loyalty card for %s from %s stamp%s to 0%s',
      v_customer_label,
      v_previous_stamp_count,
      case when v_previous_stamp_count = 1 then '' else 's' end,
      case when v_reason is not null then '. Reason: ' || v_reason else '.' end
    ),
    jsonb_build_object(
      'customer_id', v_customer.id,
      'previous_stamp_count', v_previous_stamp_count,
      'new_stamp_count', v_new_stamp_count,
      'reason', v_reason
    ),
    v_actor_id
  );

  return jsonb_build_object(
    'customerId', v_customer.id,
    'customerLabel', v_customer_label,
    'previousStampCount', v_previous_stamp_count,
    'newStampCount', v_new_stamp_count,
    'reason', v_reason,
    'resetAt', now()
  );
end;
$$;

grant execute on function public.reset_customer_loyalty_card(uuid, text) to authenticated;

create or replace function public.redeem_loyalty_reward(
  p_reward_id uuid,
  p_notes text default null,
  p_menu_item_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_reward public.loyalty_rewards%rowtype;
  v_remaining_stamps integer;
  v_redemption public.loyalty_redemptions%rowtype;
  v_is_latte_reward boolean;
  v_is_groom_reward boolean;
  v_last_groom_redeemed_at timestamptz;
  v_latte_menu_item record;
  v_reward_item public.loyalty_reward_items%rowtype;
  v_notes text;
begin
  v_customer_id := auth.uid();
  if v_customer_id is null then
    raise exception 'Authentication required.';
  end if;

  select *
  into v_reward
  from public.loyalty_rewards
  where id = p_reward_id
    and is_active = true
  limit 1;

  if not found then
    raise exception 'Reward is not available.';
  end if;

  v_is_latte_reward := v_reward.required_stamps = 6 or lower(v_reward.label) like '%latte%';
  v_is_groom_reward := v_reward.required_stamps >= 10 or lower(v_reward.label) like '%groom%';
  v_notes := nullif(trim(coalesce(p_notes, '')), '');

  if v_is_latte_reward then
    if p_menu_item_id is null then
      raise exception 'Please choose your free latte option.';
    end if;

    select
      mi.id,
      mi.code,
      mi.name,
      public.loyalty_free_latte_option_for_item_name(mi.name) as option_label
    into v_latte_menu_item
    from public.menu_item_effective_availability mi
    where mi.id = p_menu_item_id
      and mi.effective_is_available = true
      and public.loyalty_free_latte_option_for_item_name(mi.name) is not null
    limit 1;

    if not found then
      raise exception 'Selected latte is not available. Choose Cafe Latte, Matcha Latte, or Spanish Latte.';
    end if;

    v_notes := coalesce(
      v_notes,
      format('Redeemed - %s (free drink pending checkout)', v_latte_menu_item.name)
    );
  end if;

  insert into public.loyalty_accounts (customer_id, stamp_count, updated_at)
  values (v_customer_id, 0, now())
  on conflict (customer_id) do nothing;

  if v_is_latte_reward then
    select max(lr.redeemed_at)
    into v_last_groom_redeemed_at
    from public.loyalty_redemptions lr
    join public.loyalty_rewards r on r.id = lr.reward_id
    where lr.customer_id = v_customer_id
      and (r.required_stamps >= 10 or lower(r.label) like '%groom%');

    if exists (
      select 1
      from public.loyalty_redemptions lr
      where lr.customer_id = v_customer_id
        and lr.reward_id = v_reward.id
        and (v_last_groom_redeemed_at is null or lr.redeemed_at > v_last_groom_redeemed_at)
    ) then
      raise exception 'Free Latte is already redeemed for the current loyalty cycle.';
    end if;

    select la.stamp_count
    into v_remaining_stamps
    from public.loyalty_accounts la
    where la.customer_id = v_customer_id;

    if coalesce(v_remaining_stamps, 0) < v_reward.required_stamps then
      raise exception 'Not enough stamps to redeem this reward.';
    end if;
  elsif v_is_groom_reward then
    update public.loyalty_accounts
    set
      stamp_count = 0,
      updated_at = now()
    where customer_id = v_customer_id
      and stamp_count >= v_reward.required_stamps
    returning stamp_count into v_remaining_stamps;

    if not found then
      raise exception 'Not enough stamps to redeem this reward.';
    end if;

    v_remaining_stamps := 0;
  else
    update public.loyalty_accounts
    set
      stamp_count = stamp_count - v_reward.required_stamps,
      updated_at = now()
    where customer_id = v_customer_id
      and stamp_count >= v_reward.required_stamps
    returning stamp_count into v_remaining_stamps;

    if not found then
      raise exception 'Not enough stamps to redeem this reward.';
    end if;
  end if;

  insert into public.loyalty_redemptions (
    customer_id,
    reward_id,
    redeemed_at,
    notes
  )
  values (
    v_customer_id,
    v_reward.id,
    now(),
    coalesce(
      v_notes,
      case
        when v_is_groom_reward then 'Redeemed - Free Groom (loyalty reset to 0)'
        when v_is_latte_reward then 'Redeemed - Free Latte (no payment)'
        else null
      end
    )
  )
  returning * into v_redemption;

  if v_is_latte_reward then
    insert into public.loyalty_reward_items (
      redemption_id,
      customer_id,
      reward_id,
      menu_item_id,
      menu_item_code,
      item_name,
      option_label,
      status,
      notes
    )
    values (
      v_redemption.id,
      v_customer_id,
      v_reward.id,
      v_latte_menu_item.id,
      v_latte_menu_item.code,
      v_latte_menu_item.name,
      v_latte_menu_item.option_label,
      'pending',
      v_notes
    )
    returning * into v_reward_item;
  end if;

  return jsonb_build_object(
    'redemptionId', v_redemption.id,
    'customerId', v_customer_id,
    'rewardId', v_reward.id,
    'rewardLabel', v_reward.label,
    'requiredStamps', v_reward.required_stamps,
    'remainingStamps', v_remaining_stamps,
    'resetsCard', v_is_groom_reward,
    'redeemedAt', v_redemption.redeemed_at,
    'rewardItem', case
      when v_reward_item.id is not null then jsonb_build_object(
        'id', v_reward_item.id,
        'redemptionId', v_reward_item.redemption_id,
        'rewardId', v_reward_item.reward_id,
        'menuItemId', v_reward_item.menu_item_id,
        'menuItemCode', v_reward_item.menu_item_code,
        'itemName', v_reward_item.item_name,
        'optionLabel', v_reward_item.option_label,
        'status', v_reward_item.status,
        'createdAt', v_reward_item.created_at
      )
      else null
    end
  );
end;
$$;

-- =========================================================
-- HISTORICAL SALES IMPORTS (staffowner app)
-- =========================================================

create table if not exists public.sales_import_batches (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default public.generate_import_batch_code(),
  type text not null default 'sales' check (type in ('sales')),
  created_by uuid references public.profiles(id) on delete set null,
  file_name text,
  total_rows integer not null default 0,
  valid_rows integer not null default 0,
  invalid_rows integer not null default 0,
  imported_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.imported_sales_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.sales_import_batches(id) on delete cascade,
  date timestamptz not null,
  sales_total numeric(10,2) not null default 0 check (sales_total >= 0),
  gross_sales numeric(12,2) not null default 0 check (gross_sales >= 0),
  refunds_total numeric(12,2) not null default 0 check (refunds_total >= 0),
  discounts_total numeric(12,2) not null default 0 check (discounts_total >= 0),
  net_sales numeric(12,2) not null default 0 check (net_sales >= 0),
  cost_of_goods numeric(12,2) not null default 0 check (cost_of_goods >= 0),
  gross_profit numeric(12,2) not null default 0,
  margin_pct numeric(7,2) not null default 0,
  taxes_total numeric(12,2) not null default 0 check (taxes_total >= 0),
  payment_method text not null default 'unknown',
  status public.order_status not null default 'completed',
  customer_code text,
  item_code text,
  created_at timestamptz not null default now(),
  unique(date, customer_code)
);

alter table public.imported_sales_rows add column if not exists gross_sales numeric(12,2) not null default 0;
alter table public.imported_sales_rows add column if not exists refunds_total numeric(12,2) not null default 0;
alter table public.imported_sales_rows add column if not exists discounts_total numeric(12,2) not null default 0;
alter table public.imported_sales_rows add column if not exists net_sales numeric(12,2) not null default 0;
alter table public.imported_sales_rows add column if not exists cost_of_goods numeric(12,2) not null default 0;
alter table public.imported_sales_rows add column if not exists gross_profit numeric(12,2) not null default 0;
alter table public.imported_sales_rows add column if not exists margin_pct numeric(7,2) not null default 0;
alter table public.imported_sales_rows add column if not exists taxes_total numeric(12,2) not null default 0;

create index if not exists idx_imported_sales_rows_batch_id on public.imported_sales_rows(batch_id);
create index if not exists idx_imported_sales_rows_date on public.imported_sales_rows(date desc);
create index if not exists idx_imported_sales_rows_status_date on public.imported_sales_rows(status, date desc);
create index if not exists idx_sales_import_batches_created_at on public.sales_import_batches(created_at desc);

-- =========================================================
-- IMPORT ERRORS (staffowner CSV imports)
-- =========================================================

create table if not exists public.import_errors (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.sales_import_batches(id) on delete cascade,
  row_number integer not null,
  reason text not null,
  raw_row jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_import_errors_batch_id on public.import_errors(batch_id);

-- =========================================================
-- HELPER VIEW: MENU CATEGORY EFFECTIVE STATE
-- Exposes NEW badge state derived from persisted DB timestamps.
-- =========================================================

create or replace view public.menu_category_effective_state as
select
  mc.id,
  mc.name,
  mc.description,
  mc.image_url,
  mc.sort_order,
  mc.is_active,
  mc.new_tag_started_at,
  case
    when mc.new_tag_started_at is null then null
    else mc.new_tag_started_at + interval '7 days'
  end as new_tag_expires_at,
  public.menu_tag_is_new(mc.new_tag_started_at) as is_new,
  mc.created_at,
  mc.updated_at
from public.menu_categories mc;

-- =========================================================
-- HELPER VIEW: MENU EFFECTIVE AVAILABILITY
-- Exposes full menu item fields + computed availability, pricing, and tag states.
-- =========================================================

create or replace view public.menu_item_effective_availability as
select
  mi.id,
  mi.code,
  mi.category_id,
  mc.name as category_name,
  mi.name,
  mi.description,
  mi.price,
  mi.cost,
  mi.discount,
  mi.discount_type,
  mi.discount_value,
  public.menu_effective_discount(
    mi.discount,
    mi.discount_starts_at,
    mi.discount_ends_at,
    mi.price
  ) as effective_discount,
  round(
    greatest(
      coalesce(mi.price, 0) - public.menu_effective_discount(
        mi.discount,
        mi.discount_starts_at,
        mi.discount_ends_at,
        mi.price
      ),
      0
    )::numeric,
    2
  ) as effective_price,
  public.menu_effective_discount(
    mi.discount,
    mi.discount_starts_at,
    mi.discount_ends_at,
    mi.price
  ) > 0 as is_discount_active,
  mi.discount_starts_at,
  mi.discount_ends_at,
  mi.is_available,
  mi.image_url,
  mi.new_tag_started_at,
  case
    when mi.new_tag_started_at is null then null
    else mi.new_tag_started_at + interval '7 days'
  end as new_tag_expires_at,
  public.menu_tag_is_new(mi.new_tag_started_at) as is_new,
  mi.limited_time_ends_at,
  mi.limited_time_ends_at is not null and mi.limited_time_ends_at > now() as is_limited,
  public.menu_item_is_limited_expired(mi.limited_time_ends_at) as is_limited_expired,
  mc.is_active as category_is_active,
  mc.new_tag_started_at as category_new_tag_started_at,
  public.menu_tag_is_new(mc.new_tag_started_at) as category_is_new,
  mi.created_at,
  mi.updated_at,
  case
    when mi.is_available = false then false
    when mc.is_active = false then false
    when public.menu_item_is_limited_expired(mi.limited_time_ends_at) then false
    else true
  end as effective_is_available
from public.menu_items mi
join public.menu_categories mc on mc.id = mi.category_id;

create or replace view public.loyalty_free_latte_items as
select
  mi.id,
  mi.code,
  mi.name,
  mi.category_id,
  mi.category_name,
  mi.price,
  mi.effective_price,
  mi.image_url,
  public.loyalty_free_latte_option_for_item_name(mi.name) as option_label
from public.menu_item_effective_availability mi
where mi.effective_is_available = true
  and public.loyalty_free_latte_option_for_item_name(mi.name) is not null;

-- =========================================================
-- HELPER VIEW: DASHBOARD SALES FEED (LIVE + IMPORTED)
-- =========================================================

create or replace view public.dashboard_sales_feed as
select
  o.id as source_id,
  'live_order'::text as source_type,
  o.placed_at as occurred_at,
  coalesce(
    nullif(o.total_amount, 0),
    (
      select coalesce(
        sum(
          case
            when oi.line_total > 0 then oi.line_total
            else greatest(coalesce(oi.unit_price, 0) - coalesce(oi.discount_amount, 0), 0) * greatest(coalesce(oi.quantity, 1), 1)
          end
        ),
        0
      )
      from public.order_items oi
      where oi.order_id = o.id
    ),
    greatest(coalesce(o.subtotal, 0) - coalesce(o.discount_total, 0), 0)
  ) as amount,
  o.status,
  o.payment_status
from public.orders o
where o.status <> 'cancelled'

union all

select
  isr.id as source_id,
  'imported_sale'::text as source_type,
  isr.date as occurred_at,
  coalesce(nullif(isr.net_sales, 0), isr.sales_total, 0) as amount,
  isr.status,
  'paid'::public.payment_status as payment_status
from public.imported_sales_rows isr
where isr.status <> 'cancelled';

-- =========================================================
-- RPC: MENU BEST SELLERS (customer + staff)
-- Returns best-selling menu items from completed/delivered orders.
-- =========================================================

create or replace function public.menu_best_sellers(
  p_limit integer default 6,
  p_lookback_days integer default 180
)
returns table (
  menu_item_code text,
  item_name text,
  quantity_sold integer,
  revenue numeric(12,2),
  order_count integer,
  last_sold_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  with sales_lines as (
    select
      coalesce(nullif(trim(oi.menu_item_code), ''), nullif(trim(mi.code), '')) as menu_item_code,
      coalesce(nullif(trim(oi.item_name), ''), nullif(trim(mi.name), ''), 'Menu item') as item_name,
      greatest(coalesce(oi.quantity, 1), 1)::integer as quantity,
      coalesce(
        nullif(oi.line_total, 0),
        greatest(coalesce(oi.unit_price, 0) - coalesce(oi.discount_amount, 0), 0) * greatest(coalesce(oi.quantity, 1), 1),
        0
      )::numeric(12,2) as line_revenue,
      o.id as order_id,
      o.placed_at as sold_at
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    left join public.menu_items mi on mi.id = oi.menu_item_id
    where o.status in ('completed', 'delivered')
      and (
        coalesce(p_lookback_days, 0) <= 0
        or o.placed_at >= now() - make_interval(days => p_lookback_days)
      )
  )
  select
    sales_lines.menu_item_code,
    sales_lines.item_name,
    coalesce(sum(sales_lines.quantity), 0)::integer as quantity_sold,
    round(coalesce(sum(sales_lines.line_revenue), 0)::numeric, 2) as revenue,
    coalesce(count(distinct sales_lines.order_id), 0)::integer as order_count,
    max(sales_lines.sold_at) as last_sold_at
  from sales_lines
  group by sales_lines.menu_item_code, sales_lines.item_name
  order by
    coalesce(sum(sales_lines.quantity), 0) desc,
    coalesce(sum(sales_lines.line_revenue), 0) desc,
    max(sales_lines.sold_at) desc
  limit greatest(coalesce(p_limit, 6), 1);
$$;

-- =========================================================
-- CATEGORY + MENU ITEM SEED
-- =========================================================

insert into public.menu_categories (name, sort_order, description)
values
  ('Pasta & Sandwiches', 1, 'Customer-friendly cafe staples you can open and order in just a few taps.'),
  ('Rice Meals', 2, 'Comforting plates and hearty savory meals for a fuller bite.'),
  ('Iced Coffee (16oz)', 3, 'Chilled coffee favorites for quick cafe runs and slow afternoons.'),
  ('Hot Coffee (8oz)', 4, 'Warm coffee classics when you want something cozy and simple.'),
  ('Non-Caffeinated', 5, 'Refreshing non-coffee drinks with bright fruit and soda flavors.'),
  ('Frappuccino (16oz)', 6, 'Sweet blended drinks for dessert-like sips and cafe treats.')
on conflict (name) do nothing;

insert into public.menu_items (code, category_id, name, description, price, discount, is_available)
values
-- Pasta & Sandwiches
('MI-00001', (select id from public.menu_categories where lower(name)='pasta & sandwiches' limit 1), 'Baked Macaroni', null, 190, 0, true),
('MI-00002', (select id from public.menu_categories where lower(name)='pasta & sandwiches' limit 1), 'Chicken Alfredo Pasta', null, 190, 0, true),
('MI-00003', (select id from public.menu_categories where lower(name)='pasta & sandwiches' limit 1), 'Chicken Macaroni Salad', null, 120, 0, true),
('MI-00004', (select id from public.menu_categories where lower(name)='pasta & sandwiches' limit 1), 'Cheesy Beef Burger', null, 150, 0, true),
('MI-00005', (select id from public.menu_categories where lower(name)='pasta & sandwiches' limit 1), 'Chicken Popcorn', null, 120, 0, true),
('MI-00006', (select id from public.menu_categories where lower(name)='pasta & sandwiches' limit 1), 'Fish & Fries (good for sharing)', null, 200, 0, true),
('MI-00007', (select id from public.menu_categories where lower(name)='pasta & sandwiches' limit 1), 'Grilled Cheese Sandwich', null, 70, 0, true),
('MI-00008', (select id from public.menu_categories where lower(name)='pasta & sandwiches' limit 1), 'Homemade Pork Siomai (4pcs)', null, 60, 0, true),
('MI-00009', (select id from public.menu_categories where lower(name)='pasta & sandwiches' limit 1), 'Toasted Cheesy Hungarian Sandwich', null, 90, 0, true),
('MI-00010', (select id from public.menu_categories where lower(name)='pasta & sandwiches' limit 1), 'Toasted Tuna Sandwich', null, 90, 0, true),
-- Rice Meals
('MI-00011', (select id from public.menu_categories where lower(name)='rice meals' limit 1), 'Breaded Fish Fillet with Rice', null, 140, 0, true),
('MI-00012', (select id from public.menu_categories where lower(name)='rice meals' limit 1), 'Burger Steak with Rice', null, 160, 0, true),
('MI-00013', (select id from public.menu_categories where lower(name)='rice meals' limit 1), 'Chicken Cordon Bleu with Rice', null, 180, 0, true),
('MI-00014', (select id from public.menu_categories where lower(name)='rice meals' limit 1), 'Chicken Poppers with Rice', null, 140, 0, true),
('MI-00015', (select id from public.menu_categories where lower(name)='rice meals' limit 1), 'Homemade Pork Embotido with Rice', null, 150, 0, true),
('MI-00016', (select id from public.menu_categories where lower(name)='rice meals' limit 1), 'Homemade Pork Siomai (4pcs) with Rice', null, 80, 0, true),
('MI-00017', (select id from public.menu_categories where lower(name)='rice meals' limit 1), 'Hungarian Sausage with Rice', null, 120, 0, true),
-- Iced Coffee
('MI-00018', (select id from public.menu_categories where lower(name)='iced coffee (16oz)' limit 1), 'Americano', null, 100, 0, true),
('MI-00019', (select id from public.menu_categories where lower(name)='iced coffee (16oz)' limit 1), 'Cafe Latte', null, 120, 0, true),
('MI-00020', (select id from public.menu_categories where lower(name)='iced coffee (16oz)' limit 1), 'Caramel Macchiato', null, 145, 0, true),
('MI-00021', (select id from public.menu_categories where lower(name)='iced coffee (16oz)' limit 1), 'Cloud Americano', null, 120, 0, true),
('MI-00022', (select id from public.menu_categories where lower(name)='iced coffee (16oz)' limit 1), 'Iced Caramel Latte', null, 135, 0, true),
('MI-00023', (select id from public.menu_categories where lower(name)='iced coffee (16oz)' limit 1), 'Iced Cocoa Tiramisu', null, 160, 0, true),
('MI-00024', (select id from public.menu_categories where lower(name)='iced coffee (16oz)' limit 1), 'Iced Coconut Latte', null, 145, 0, true),
('MI-00025', (select id from public.menu_categories where lower(name)='iced coffee (16oz)' limit 1), 'Iced Hazelnut Latte', null, 135, 0, true),
('MI-00026', (select id from public.menu_categories where lower(name)='iced coffee (16oz)' limit 1), 'Iced Matcha Latte', null, 135, 0, true),
('MI-00027', (select id from public.menu_categories where lower(name)='iced coffee (16oz)' limit 1), 'Iced Mocha Latte', null, 135, 0, true),
('MI-00028', (select id from public.menu_categories where lower(name)='iced coffee (16oz)' limit 1), 'Iced Vanilla Latte', null, 135, 0, true),
('MI-00029', (select id from public.menu_categories where lower(name)='iced coffee (16oz)' limit 1), 'Spanish Latte', null, 140, 0, true),
-- Hot Coffee
('MI-00030', (select id from public.menu_categories where lower(name)='hot coffee (8oz)' limit 1), 'Americano', null, 90, 0, true),
('MI-00031', (select id from public.menu_categories where lower(name)='hot coffee (8oz)' limit 1), 'Cafe Latte', null, 110, 0, true),
('MI-00032', (select id from public.menu_categories where lower(name)='hot coffee (8oz)' limit 1), 'Caramel Macchiato', null, 130, 0, true),
('MI-00033', (select id from public.menu_categories where lower(name)='hot coffee (8oz)' limit 1), 'Matcha Latte', null, 110, 0, true),
('MI-00034', (select id from public.menu_categories where lower(name)='hot coffee (8oz)' limit 1), 'Spanish Latte', null, 120, 0, true),
-- Non-Caffeinated
('MI-00035', (select id from public.menu_categories where lower(name)='non-caffeinated' limit 1), 'Four Seasons', null, 90, 0, true),
('MI-00036', (select id from public.menu_categories where lower(name)='non-caffeinated' limit 1), 'Hot Chocolate', null, 110, 0, true),
('MI-00037', (select id from public.menu_categories where lower(name)='non-caffeinated' limit 1), 'Iced Choco Milk', null, 120, 0, true),
('MI-00038', (select id from public.menu_categories where lower(name)='non-caffeinated' limit 1), 'Strawberry Milk', null, 120, 0, true),
('MI-00039', (select id from public.menu_categories where lower(name)='non-caffeinated' limit 1), 'Blueberry Soda', null, 90, 0, true),
('MI-00040', (select id from public.menu_categories where lower(name)='non-caffeinated' limit 1), 'Green Apple Soda', null, 90, 0, true),
('MI-00041', (select id from public.menu_categories where lower(name)='non-caffeinated' limit 1), 'Strawberry Soda', null, 90, 0, true),
-- Frappuccino
('MI-00042', (select id from public.menu_categories where lower(name)='frappuccino (16oz)' limit 1), 'Caramel Macchiato Frappe', null, 170, 0, true),
('MI-00043', (select id from public.menu_categories where lower(name)='frappuccino (16oz)' limit 1), 'Choco Java Chip Frappe', null, 170, 0, true),
('MI-00044', (select id from public.menu_categories where lower(name)='frappuccino (16oz)' limit 1), 'Matcha Frappe', null, 170, 0, true),
('MI-00045', (select id from public.menu_categories where lower(name)='frappuccino (16oz)' limit 1), 'Peanut Butter Choco Frappe', null, 175, 0, true),
('MI-00046', (select id from public.menu_categories where lower(name)='frappuccino (16oz)' limit 1), 'Strawberry Frappe', null, 170, 0, true)
on conflict (code) do nothing;

update public.menu_items as mi
set cost = seeded.cost
from (
  values
    ('MI-00001', 100.00::numeric),
    ('MI-00002', 70.00::numeric),
    ('MI-00003', 80.00::numeric),
    ('MI-00004', 85.00::numeric),
    ('MI-00005', 45.00::numeric),
    ('MI-00006', 60.00::numeric),
    ('MI-00007', 39.00::numeric),
    ('MI-00008', 65.00::numeric),
    ('MI-00009', 120.00::numeric),
    ('MI-00010', 95.00::numeric),
    ('MI-00011', 60.00::numeric),
    ('MI-00012', 70.00::numeric),
    ('MI-00013', 100.00::numeric),
    ('MI-00014', 90.00::numeric),
    ('MI-00015', 85.00::numeric),
    ('MI-00016', 80.00::numeric),
    ('MI-00017', 75.00::numeric),
    ('MI-00018', 70.00::numeric),
    ('MI-00019', 32.00::numeric),
    ('MI-00020', 50.00::numeric),
    ('MI-00021', 58.00::numeric),
    ('MI-00022', 53.00::numeric),
    ('MI-00023', 53.00::numeric),
    ('MI-00024', 75.00::numeric),
    ('MI-00025', 40.00::numeric),
    ('MI-00026', 28.00::numeric),
    ('MI-00027', 41.00::numeric),
    ('MI-00028', 60.00::numeric),
    ('MI-00029', 50.00::numeric),
    ('MI-00030', 45.00::numeric),
    ('MI-00031', 47.00::numeric),
    ('MI-00032', 55.00::numeric),
    ('MI-00033', 50.00::numeric),
    ('MI-00034', 65.00::numeric),
    ('MI-00035', 60.00::numeric),
    ('MI-00036', 65.00::numeric),
    ('MI-00037', 75.00::numeric),
    ('MI-00038', 75.00::numeric),
    ('MI-00039', 77.00::numeric),
    ('MI-00040', 85.00::numeric),
    ('MI-00041', 70.00::numeric),
    ('MI-00042', 70.00::numeric),
    ('MI-00043', 75.00::numeric),
    ('MI-00044', 90.00::numeric),
    ('MI-00045', 0.00::numeric),
    ('MI-00046', 0.00::numeric)
) as seeded(code, cost)
where mi.code = seeded.code;

-- Keep future auto-generated codes after the seeded set (use max numeric suffix, not row count).
select setval(
  'public.menu_item_code_seq',
  greatest(
    coalesce((select max(substring(code from '[0-9]+$')::bigint) from public.menu_items where code like 'MI-%'), 0),
    46
  ),
  true
);

-- Legacy optional starter ingredients
insert into public.ingredients (code, name, unit, stock_on_hand, reorder_level, is_active)
values
  ('ING-00001', 'Sugar', 'g', 5000, 1000, true),
  ('ING-00002', 'Coffee Grounds', 'g', 3000, 500, true),
  ('ING-00003', 'Milk', 'ml', 10000, 2000, true),
  ('ING-00004', 'Rice', 'g', 8000, 2000, true),
  ('ING-00005', 'Chocolate Syrup', 'ml', 2000, 500, true),
  ('ING-00006', 'Caramel Syrup', 'ml', 2000, 500, true),
  ('ING-00007', 'Matcha Powder', 'g', 1000, 200, true),
  ('ING-00008', 'Ice', 'pcs', 1000, 200, true),
  ('ING-00009', 'Cups 16oz', 'pcs', 500, 100, true),
  ('ING-00010', 'Cups 8oz', 'pcs', 500, 100, true)
on conflict (code) do nothing;

select setval(
  'public.ingredient_code_seq',
  greatest(
    coalesce((select max(substring(code from '[0-9]+$')::bigint) from public.ingredients where code like 'ING-%'), 0),
    10
  ),
  true
);

-- Starter categories for the new categorized inventory tracker.
-- NOTE: destructive cleanup of existing inventory rows is intentionally excluded
-- from this rerunnable schema. Any data cleanup should be executed as a separate,
-- explicit migration after business sign-off.

insert into public.inventory_categories (name, sort_order, is_active)
values
  ('Cafe Kitchen', 1, true),
  ('Sandwich and Breakfast', 2, true),
  ('Condiments and Drinks', 3, true),
  ('Syrups and Spreads', 4, true),
  ('Packaging', 5, true),
  ('Plastic Bags', 6, true),
  ('Cleaning and Utilities', 7, true)
on conflict (name) do update
set
  sort_order = excluded.sort_order,
  is_active = excluded.is_active;

-- Starter inventory items mapped from the categorized tracker list
insert into public.inventory_items (
  code,
  category_id,
  name,
  unit,
  quantity_on_hand,
  reorder_level,
  display_quantity,
  notes,
  is_active
)
values
  ('INV-00001', (select id from public.inventory_categories where name = 'Cafe Kitchen' limit 1), 'Pasta', 'orders', 12, 5, '12', null, true),
  ('INV-00002', (select id from public.inventory_categories where name = 'Cafe Kitchen' limit 1), 'Alfredo sauce', 'orders', 5, 3, '5', null, true),
  ('INV-00003', (select id from public.inventory_categories where name = 'Cafe Kitchen' limit 1), 'Carbonara sauce', 'orders', 3, 3, '3', null, true),
  ('INV-00004', (select id from public.inventory_categories where name = 'Cafe Kitchen' limit 1), 'Pesto sauce', 'orders', 1, 2, '1', null, true),
  ('INV-00005', (select id from public.inventory_categories where name = 'Cafe Kitchen' limit 1), 'Chicken fillet', 'pcs', 0, 2, '0', null, true),
  ('INV-00006', (select id from public.inventory_categories where name = 'Cafe Kitchen' limit 1), 'Chicken tenders', 'pcs', 12, 5, '12', null, true),
  ('INV-00007', (select id from public.inventory_categories where name = 'Cafe Kitchen' limit 1), 'Hashbrown', 'orders', 6, 3, '6', null, true),
  ('INV-00008', (select id from public.inventory_categories where name = 'Sandwich and Breakfast' limit 1), 'Eggs', 'pcs', 4, 4, '4', null, true),
  ('INV-00009', (select id from public.inventory_categories where name = 'Sandwich and Breakfast' limit 1), 'Eden sliced cheese', 'pcs', 14, 6, '14', null, true),
  ('INV-00010', (select id from public.inventory_categories where name = 'Sandwich and Breakfast' limit 1), 'Burger bun', 'pcs', 2, 3, '2', null, true),
  ('INV-00011', (select id from public.inventory_categories where name = 'Condiments and Drinks' limit 1), 'UFC gravy', 'packs', 7, 3, '7', null, true),
  ('INV-00012', (select id from public.inventory_categories where name = 'Condiments and Drinks' limit 1), 'Sweet chili sauce', 'orders', 5, 3, '5', null, true),
  ('INV-00013', (select id from public.inventory_categories where name = 'Condiments and Drinks' limit 1), 'Purified bottled water', 'bottles', 5, 5, '5', null, true),
  ('INV-00014', (select id from public.inventory_categories where name = 'Condiments and Drinks' limit 1), 'Sprite', 'liters', 2.5, 2, '2 1/2', null, true),
  ('INV-00015', (select id from public.inventory_categories where name = 'Syrups and Spreads' limit 1), 'Hazelnut syrup', 'bottles', 1, 1, '1', null, true),
  ('INV-00016', (select id from public.inventory_categories where name = 'Syrups and Spreads' limit 1), 'Sugar syrup', 'bottles', 1, 1, '1', null, true),
  ('INV-00017', (select id from public.inventory_categories where name = 'Syrups and Spreads' limit 1), 'Tiramisu syrup', 'bottles', 1.5, 1, '1 1/2', null, true),
  ('INV-00018', (select id from public.inventory_categories where name = 'Syrups and Spreads' limit 1), 'Strawberry jam', 'jar', 0.75, 1, '3/4', null, true),
  ('INV-00019', (select id from public.inventory_categories where name = 'Packaging' limit 1), '8oz cup', 'pcs', 22, 20, '22', null, true),
  ('INV-00020', (select id from public.inventory_categories where name = 'Packaging' limit 1), '8oz lid', 'pcs', 73, 30, '73', null, true),
  ('INV-00021', (select id from public.inventory_categories where name = 'Packaging' limit 1), '8oz new cup (HappyTails)', 'pcs', 0, 20, '0', 'May bawas na', true),
  ('INV-00022', (select id from public.inventory_categories where name = 'Packaging' limit 1), '8oz new lid (HappyTails)', 'pcs', 21, 20, '21', 'May bawas na', true),
  ('INV-00023', (select id from public.inventory_categories where name = 'Packaging' limit 1), 'Table napkin', 'pack', 1, 1, '1', 'May bawas na', true),
  ('INV-00024', (select id from public.inventory_categories where name = 'Packaging' limit 1), 'Thermal paper', 'rolls', 0, 2, '0', null, true),
  ('INV-00025', (select id from public.inventory_categories where name = 'Packaging' limit 1), 'Maya thermal paper', 'pcs', 35, 20, '35', null, true),
  ('INV-00026', (select id from public.inventory_categories where name = 'Packaging' limit 1), 'Takeout box large (styro)', 'pcs', 4, 3, '4', 'For humans', true),
  ('INV-00027', (select id from public.inventory_categories where name = 'Packaging' limit 1), 'Takeout box small', 'pcs', 12, 6, '12', null, true),
  ('INV-00028', (select id from public.inventory_categories where name = 'Plastic Bags' limit 1), 'Thankyou plastic takeout XS', 'pack', 1, 1, '1', null, true),
  ('INV-00029', (select id from public.inventory_categories where name = 'Plastic Bags' limit 1), 'Thankyou plastic takeout S', 'pack', 0, 1, '0', null, true),
  ('INV-00030', (select id from public.inventory_categories where name = 'Plastic Bags' limit 1), 'Thankyou plastic takeout M', 'pack', 1, 1, '1', null, true),
  ('INV-00031', (select id from public.inventory_categories where name = 'Plastic Bags' limit 1), 'Thankyou plastic takeout L', 'pack', 1, 1, '1', null, true),
  ('INV-00032', (select id from public.inventory_categories where name = 'Cleaning and Utilities' limit 1), 'Sponge', 'pcs', 1, 1, '1', null, true),
  ('INV-00033', (select id from public.inventory_categories where name = 'Cleaning and Utilities' limit 1), 'Trash bag', 'pack', 1, 1, '1', 'May bawas na', true),
  ('INV-00034', (select id from public.inventory_categories where name = 'Cleaning and Utilities' limit 1), 'Alcohol', 'bottle', 0.25, 1, '1/4', null, true),
  ('INV-00035', (select id from public.inventory_categories where name = 'Cleaning and Utilities' limit 1), 'Dishwashing liquid', 'bottle', 0.25, 1, '1/4', null, true),
  ('INV-00036', (select id from public.inventory_categories where name = 'Cleaning and Utilities' limit 1), 'Hand soap', 'bottle', 0.75, 1, '3/4', null, true),
  ('INV-00037', (select id from public.inventory_categories where name = 'Cleaning and Utilities' limit 1), 'Lysol', 'bottle', 0, 1, '0', null, true)
on conflict (code) do nothing;

select setval(
  'public.inventory_item_code_seq',
  greatest(
    coalesce((select max(substring(code from '[0-9]+$')::bigint) from public.inventory_items where code like 'INV-%'), 0),
    37
  ),
  true
);

-- Optional starter loyalty rewards
update public.loyalty_rewards
set
  label = 'Free Latte',
  required_stamps = 6,
  is_active = true
where lower(label) in ('free drink upgrade', 'free coffee')
  and required_stamps = 6;

update public.loyalty_rewards
set
  label = 'Free Groom',
  required_stamps = 10,
  is_active = true
where lower(label) in ('free drink upgrade', 'free coffee')
  and required_stamps >= 10;

insert into public.loyalty_rewards (label, required_stamps, is_active)
select 'Free Latte', 6, true
where not exists (
  select 1
  from public.loyalty_rewards
  where lower(label) = 'free latte'
);

insert into public.loyalty_rewards (label, required_stamps, is_active)
select 'Free Groom', 10, true
where not exists (
  select 1
  from public.loyalty_rewards
  where lower(label) = 'free groom'
);

-- =========================================================
-- ACTIVITY LOG TRIGGERS (track who changed key records)
-- =========================================================

drop trigger if exists trg_inventory_items_activity on public.inventory_items;
create trigger trg_inventory_items_activity
after insert or update or delete on public.inventory_items
for each row execute procedure public.log_table_activity();

drop trigger if exists trg_inventory_categories_activity on public.inventory_categories;
create trigger trg_inventory_categories_activity
after insert or update or delete on public.inventory_categories
for each row execute procedure public.log_table_activity();

drop trigger if exists trg_menu_items_activity on public.menu_items;
create trigger trg_menu_items_activity
after insert or update or delete on public.menu_items
for each row execute procedure public.log_table_activity();

drop trigger if exists trg_menu_categories_activity on public.menu_categories;
create trigger trg_menu_categories_activity
after insert or update or delete on public.menu_categories
for each row execute procedure public.log_table_activity();

drop trigger if exists trg_daily_menus_activity on public.daily_menus;
create trigger trg_daily_menus_activity
after insert or update or delete on public.daily_menus
for each row execute procedure public.log_table_activity();

drop trigger if exists trg_loyalty_rewards_activity on public.loyalty_rewards;
create trigger trg_loyalty_rewards_activity
after insert or update or delete on public.loyalty_rewards
for each row execute procedure public.log_table_activity();

-- =========================================================
-- ROW LEVEL SECURITY
-- =========================================================

alter table public.profiles enable row level security;
alter table public.business_settings enable row level security;
alter table public.campaign_announcements enable row level security;
alter table public.login_history enable row level security;
alter table public.activity_logs enable row level security;
alter table public.menu_categories enable row level security;
alter table public.menu_items enable row level security;
alter table public.ingredients enable row level security;
alter table public.menu_item_recipe_lines enable row level security;
alter table public.inventory_categories enable row level security;
alter table public.inventory_items enable row level security;
alter table public.daily_menus enable row level security;
alter table public.daily_menu_items enable row level security;
alter table public.loyalty_accounts enable row level security;
alter table public.loyalty_rewards enable row level security;
alter table public.loyalty_redemptions enable row level security;
alter table public.loyalty_reward_items enable row level security;
alter table public.loyalty_stamp_events enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_status_history enable row level security;
alter table public.sales_import_batches enable row level security;
alter table public.imported_sales_rows enable row level security;
alter table public.import_errors enable row level security;

-- =========================================================
-- POLICIES
-- =========================================================

-- profiles
drop policy if exists "profiles_select_own_or_staff" on public.profiles;
create policy "profiles_select_own_or_staff"
on public.profiles for select
using (
  auth.uid() = id or public.is_owner_or_staff()
);

drop policy if exists "profiles_update_own_or_owner" on public.profiles;
create policy "profiles_update_own_or_owner"
on public.profiles for update
using (
  auth.uid() = id or public.is_owner()
)
with check (
  auth.uid() = id or public.is_owner()
);

drop policy if exists "business_settings_read_all" on public.business_settings;
create policy "business_settings_read_all"
on public.business_settings for select
using (true);

drop policy if exists "business_settings_owner_only" on public.business_settings;
create policy "business_settings_owner_only"
on public.business_settings for all
using (public.is_owner())
with check (public.is_owner());

drop policy if exists "campaign_announcements_read_all" on public.campaign_announcements;
create policy "campaign_announcements_read_all"
on public.campaign_announcements for select
using (true);

drop policy if exists "campaign_announcements_manage_owner_staff" on public.campaign_announcements;
create policy "campaign_announcements_manage_owner_staff"
on public.campaign_announcements for all
using (public.is_owner_or_staff())
with check (public.is_owner_or_staff());

-- public menu readable by everyone
drop policy if exists "menu_categories_read_all" on public.menu_categories;
create policy "menu_categories_read_all"
on public.menu_categories for select
using (true);

drop policy if exists "menu_items_read_all" on public.menu_items;
create policy "menu_items_read_all"
on public.menu_items for select
using (true);

drop policy if exists "daily_menus_read_all" on public.daily_menus;
create policy "daily_menus_read_all"
on public.daily_menus for select
using (true);

drop policy if exists "daily_menu_items_read_all" on public.daily_menu_items;
create policy "daily_menu_items_read_all"
on public.daily_menu_items for select
using (true);

drop policy if exists "loyalty_rewards_read_all" on public.loyalty_rewards;
create policy "loyalty_rewards_read_all"
on public.loyalty_rewards for select
using (true);

-- owner/staff manage menu/inventory
drop policy if exists "menu_categories_manage_owner_staff" on public.menu_categories;
create policy "menu_categories_manage_owner_staff"
on public.menu_categories for all
using (public.is_owner_or_staff())
with check (public.is_owner_or_staff());

drop policy if exists "menu_items_manage_owner_staff" on public.menu_items;
create policy "menu_items_manage_owner_staff"
on public.menu_items for all
using (public.is_owner_or_staff())
with check (public.is_owner_or_staff());

drop policy if exists "ingredients_manage_owner_staff" on public.ingredients;
create policy "ingredients_manage_owner_staff"
on public.ingredients for all
using (public.is_owner_or_staff())
with check (public.is_owner_or_staff());

drop policy if exists "recipe_lines_manage_owner_staff" on public.menu_item_recipe_lines;
create policy "recipe_lines_manage_owner_staff"
on public.menu_item_recipe_lines for all
using (public.is_owner_or_staff())
with check (public.is_owner_or_staff());

drop policy if exists "inventory_categories_manage_owner_staff" on public.inventory_categories;
create policy "inventory_categories_manage_owner_staff"
on public.inventory_categories for all
using (public.is_owner_or_staff())
with check (public.is_owner_or_staff());

drop policy if exists "inventory_items_manage_owner_staff" on public.inventory_items;
create policy "inventory_items_manage_owner_staff"
on public.inventory_items for all
using (public.is_owner_or_staff())
with check (public.is_owner_or_staff());

drop policy if exists "daily_menus_manage_owner_staff" on public.daily_menus;
create policy "daily_menus_manage_owner_staff"
on public.daily_menus for all
using (public.is_owner_or_staff())
with check (public.is_owner_or_staff());

drop policy if exists "daily_menu_items_manage_owner_staff" on public.daily_menu_items;
create policy "daily_menu_items_manage_owner_staff"
on public.daily_menu_items for all
using (public.is_owner_or_staff())
with check (public.is_owner_or_staff());

-- loyalty
drop policy if exists "loyalty_accounts_read_own_or_staff" on public.loyalty_accounts;
create policy "loyalty_accounts_read_own_or_staff"
on public.loyalty_accounts for select
using (
  customer_id = auth.uid() or public.is_owner_or_staff()
);

drop policy if exists "loyalty_accounts_manage_owner_staff" on public.loyalty_accounts;
create policy "loyalty_accounts_manage_owner_staff"
on public.loyalty_accounts for all
using (public.is_owner_or_staff())
with check (public.is_owner_or_staff());

drop policy if exists "loyalty_redemptions_read_own_or_staff" on public.loyalty_redemptions;
create policy "loyalty_redemptions_read_own_or_staff"
on public.loyalty_redemptions for select
using (
  customer_id = auth.uid() or public.is_owner_or_staff()
);

drop policy if exists "loyalty_redemptions_manage_owner_staff" on public.loyalty_redemptions;
create policy "loyalty_redemptions_manage_owner_staff"
on public.loyalty_redemptions for all
using (public.is_owner_or_staff())
with check (public.is_owner_or_staff());

drop policy if exists "loyalty_reward_items_read_own_or_staff" on public.loyalty_reward_items;
create policy "loyalty_reward_items_read_own_or_staff"
on public.loyalty_reward_items for select
using (
  customer_id = auth.uid() or public.is_owner_or_staff()
);

drop policy if exists "loyalty_reward_items_manage_owner_staff" on public.loyalty_reward_items;
create policy "loyalty_reward_items_manage_owner_staff"
on public.loyalty_reward_items for all
using (public.is_owner_or_staff())
with check (public.is_owner_or_staff());

drop policy if exists "loyalty_stamp_events_read_own_or_staff" on public.loyalty_stamp_events;
create policy "loyalty_stamp_events_read_own_or_staff"
on public.loyalty_stamp_events for select
using (
  customer_id = auth.uid() or public.is_owner_or_staff()
);

drop policy if exists "loyalty_stamp_events_manage_owner_staff" on public.loyalty_stamp_events;
create policy "loyalty_stamp_events_manage_owner_staff"
on public.loyalty_stamp_events for all
using (public.is_owner_or_staff())
with check (public.is_owner_or_staff());

-- orders
drop policy if exists "orders_read_own_or_staff" on public.orders;
create policy "orders_read_own_or_staff"
on public.orders for select
using (
  customer_id = auth.uid() or public.is_owner_or_staff()
);

drop policy if exists "orders_insert_customer_or_staff" on public.orders;
create policy "orders_insert_customer_or_staff"
on public.orders for insert
with check (
  auth.uid() = customer_id or public.is_owner_or_staff()
);

-- Staff can update anything; customers can submit an update (DB trigger enforces cancellation-only).
drop policy if exists "orders_update_staff_only" on public.orders;
drop policy if exists "orders_update_staff_or_customer_cancel" on public.orders;
create policy "orders_update_staff_or_customer_cancel"
on public.orders for update
using (
  public.is_owner_or_staff() or customer_id = auth.uid()
)
with check (
  public.is_owner_or_staff() or customer_id = auth.uid()
);

drop policy if exists "order_items_read_own_or_staff" on public.order_items;
create policy "order_items_read_own_or_staff"
on public.order_items for select
using (
  exists (
    select 1 from public.orders o
    where o.id = order_id
      and (o.customer_id = auth.uid() or public.is_owner_or_staff())
  )
);

drop policy if exists "order_items_insert_customer_or_staff" on public.order_items;
create policy "order_items_insert_customer_or_staff"
on public.order_items for insert
with check (
  exists (
    select 1 from public.orders o
    where o.id = order_id
      and (o.customer_id = auth.uid() or public.is_owner_or_staff())
  )
);

drop policy if exists "order_items_update_staff_only" on public.order_items;
create policy "order_items_update_staff_only"
on public.order_items for update
using (public.is_owner_or_staff())
with check (public.is_owner_or_staff());

drop policy if exists "order_status_history_read_own_or_staff" on public.order_status_history;
create policy "order_status_history_read_own_or_staff"
on public.order_status_history for select
using (
  exists (
    select 1 from public.orders o
    where o.id = order_id
      and (o.customer_id = auth.uid() or public.is_owner_or_staff())
  )
);

-- Allow customers to write their own history entries (customer app uses best-effort inserts).
drop policy if exists "order_status_history_insert_own_or_staff" on public.order_status_history;
create policy "order_status_history_insert_own_or_staff"
on public.order_status_history for insert
with check (
  exists (
    select 1 from public.orders o
    where o.id = order_id
      and (o.customer_id = auth.uid() or public.is_owner_or_staff())
  )
);

drop policy if exists "order_status_history_manage_staff_only" on public.order_status_history;
create policy "order_status_history_manage_staff_only"
on public.order_status_history for update
using (public.is_owner_or_staff())
with check (public.is_owner_or_staff());

-- imports remain owner-managed, but staff may read imported sales rows so
-- the shared dashboard can show the same historical analytics as owner.
drop policy if exists "sales_import_batches_owner_only" on public.sales_import_batches;
create policy "sales_import_batches_owner_only"
on public.sales_import_batches for all
using (public.is_owner())
with check (public.is_owner());

drop policy if exists "imported_sales_rows_owner_only" on public.imported_sales_rows;
drop policy if exists "imported_sales_rows_read_owner_staff" on public.imported_sales_rows;
drop policy if exists "imported_sales_rows_manage_owner_only" on public.imported_sales_rows;
create policy "imported_sales_rows_read_owner_staff"
on public.imported_sales_rows for select
using (public.is_owner_or_staff());

create policy "imported_sales_rows_manage_owner_only"
on public.imported_sales_rows for all
using (public.is_owner())
with check (public.is_owner());

drop policy if exists "import_errors_owner_only" on public.import_errors;
create policy "import_errors_owner_only"
on public.import_errors for all
using (public.is_owner())
with check (public.is_owner());

-- login history
drop policy if exists "login_history_read_own_or_staff" on public.login_history;
create policy "login_history_read_own_or_staff"
on public.login_history for select
using (
  profile_id = auth.uid() or public.is_owner_or_staff()
);

drop policy if exists "login_history_insert_self_or_staff" on public.login_history;
create policy "login_history_insert_self_or_staff"
on public.login_history for insert
with check (
  profile_id = auth.uid() or public.is_owner_or_staff()
);

drop policy if exists "login_history_update_self_or_staff" on public.login_history;
create policy "login_history_update_self_or_staff"
on public.login_history for update
using (
  profile_id = auth.uid() or public.is_owner_or_staff()
)
with check (
  profile_id = auth.uid() or public.is_owner_or_staff()
);

-- activity logs
drop policy if exists "activity_logs_read_owner_staff" on public.activity_logs;
create policy "activity_logs_read_owner_staff"
on public.activity_logs for select
using (public.is_owner_or_staff());

drop policy if exists "activity_logs_insert_owner_staff" on public.activity_logs;
create policy "activity_logs_insert_owner_staff"
on public.activity_logs for insert
with check (public.is_owner_or_staff());

drop policy if exists "activity_logs_update_owner_only" on public.activity_logs;
create policy "activity_logs_update_owner_only"
on public.activity_logs for update
using (public.is_owner())
with check (public.is_owner());

drop policy if exists "activity_logs_delete_owner_only" on public.activity_logs;
create policy "activity_logs_delete_owner_only"
on public.activity_logs for delete
using (public.is_owner());

-- storage (menu item images)
do $$
begin
  if to_regclass('storage.buckets') is not null and to_regclass('storage.objects') is not null then
    insert into storage.buckets (id, name, public)
    values ('menu-images', 'menu-images', true)
    on conflict (id) do update set public = excluded.public;

    execute 'drop policy if exists "menu_images_public_read" on storage.objects';
    execute 'create policy "menu_images_public_read" on storage.objects for select using (bucket_id = ''menu-images'')';

    execute 'drop policy if exists "menu_images_owner_staff_insert" on storage.objects';
    execute 'create policy "menu_images_owner_staff_insert" on storage.objects for insert to authenticated with check (bucket_id = ''menu-images'' and public.is_owner_or_staff())';

    execute 'drop policy if exists "menu_images_owner_staff_update" on storage.objects';
    execute 'create policy "menu_images_owner_staff_update" on storage.objects for update to authenticated using (bucket_id = ''menu-images'' and public.is_owner_or_staff()) with check (bucket_id = ''menu-images'' and public.is_owner_or_staff())';

    execute 'drop policy if exists "menu_images_owner_staff_delete" on storage.objects';
    execute 'create policy "menu_images_owner_staff_delete" on storage.objects for delete to authenticated using (bucket_id = ''menu-images'' and public.is_owner_or_staff())';

    execute 'drop policy if exists "menu_images_profile_insert_self" on storage.objects';
    execute '' ||
      'create policy "menu_images_profile_insert_self" on storage.objects ' ||
      'for insert to authenticated with check (' ||
      'bucket_id = ''menu-images'' ' ||
      'and auth.uid() is not null ' ||
      'and (storage.foldername(name))[1] = ''profiles'' ' ||
      'and (storage.foldername(name))[2] = auth.uid()::text' ||
      ')';

    execute 'drop policy if exists "menu_images_profile_update_self" on storage.objects';
    execute '' ||
      'create policy "menu_images_profile_update_self" on storage.objects ' ||
      'for update to authenticated using (' ||
      'bucket_id = ''menu-images'' ' ||
      'and auth.uid() is not null ' ||
      'and (storage.foldername(name))[1] = ''profiles'' ' ||
      'and (storage.foldername(name))[2] = auth.uid()::text' ||
      ') with check (' ||
      'bucket_id = ''menu-images'' ' ||
      'and auth.uid() is not null ' ||
      'and (storage.foldername(name))[1] = ''profiles'' ' ||
      'and (storage.foldername(name))[2] = auth.uid()::text' ||
      ')';

    execute 'drop policy if exists "menu_images_profile_delete_self" on storage.objects';
    execute '' ||
      'create policy "menu_images_profile_delete_self" on storage.objects ' ||
      'for delete to authenticated using (' ||
      'bucket_id = ''menu-images'' ' ||
      'and auth.uid() is not null ' ||
      'and (storage.foldername(name))[1] = ''profiles'' ' ||
      'and (storage.foldername(name))[2] = auth.uid()::text' ||
      ')';
  end if;
end
$$;

-- =========================================================
-- RPC: DASHBOARD TOTALS BY RANGE (staffowner app)
-- Supports: today, 7d, 30d, 90d, 3m, 6m, 1y, all
-- =========================================================

create or replace function public.dashboard_summary(range_key text default '30d')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  start_ts timestamptz;
  result jsonb;
begin
  -- Only staff/owner should be able to call this RPC.
  if auth.uid() is not null and not public.is_owner_or_staff() then
    raise exception 'Access denied.';
  end if;

  start_ts := case range_key
    when 'today' then date_trunc('day', now())
    when '7d' then now() - interval '7 days'
    when '30d' then now() - interval '30 days'
    when '90d' then now() - interval '90 days'
    when '3m' then now() - interval '3 months'
    when '6m' then now() - interval '6 months'
    when '1y' then now() - interval '1 year'
    when 'all' then null
    else now() - interval '30 days'
  end;

  with filtered_sales as (
    select *
    from public.dashboard_sales_feed dsf
    where start_ts is null or dsf.occurred_at >= start_ts
  ),
  sales_today as (
    select coalesce(sum(amount), 0) as total
    from public.dashboard_sales_feed
    where occurred_at >= date_trunc('day', now())
  ),
  sales_range as (
    select coalesce(sum(amount), 0) as total
    from filtered_sales
  ),
  avg_order_value as (
    select coalesce(avg(amount), 0) as avg_value
    from filtered_sales
  ),
  live_orders as (
    select *
    from public.orders o
    where start_ts is null or o.placed_at >= start_ts
  ),
  order_counts as (
    select
      count(*) filter (where placed_at >= date_trunc('day', now())) as today,
      count(*) as range_total,
      count(*) filter (where status = 'pending') as pending,
      count(*) filter (where status = 'preparing') as preparing,
      count(*) filter (where status = 'ready') as ready,
      count(*) filter (where status = 'out_for_delivery') as out_for_delivery,
      count(*) filter (where status in ('completed','delivered')) as completed,
      count(*) filter (where status = 'cancelled') as cancelled
    from live_orders
  ),
  top_items as (
    select jsonb_agg(
      jsonb_build_object(
        'itemName', x.item_name,
        'quantity', x.qty,
        'revenue', x.revenue
      )
      order by x.qty desc, x.revenue desc
    ) as items
    from (
      select
        oi.item_name,
        sum(oi.quantity)::int as qty,
        sum(
          case
            when oi.line_total > 0 then oi.line_total
            else greatest(coalesce(oi.unit_price, 0) - coalesce(oi.discount_amount, 0), 0) * greatest(coalesce(oi.quantity, 1), 1)
          end
        )::numeric(10,2) as revenue
      from public.order_items oi
      join public.orders o on o.id = oi.order_id
      where start_ts is null or o.placed_at >= start_ts
        and o.status in ('completed', 'delivered')
      group by oi.item_name
      order by qty desc, revenue desc
      limit 10
    ) x
  ),
  recent_orders as (
    select jsonb_agg(
      jsonb_build_object(
        'id', o.id,
        'code', o.code,
        'customerId', o.customer_id,
        'customerName', coalesce(nullif(trim(p.name), ''), nullif(trim(o.delivery_address->>'name'), '')),
        'status', o.status,
        'paymentStatus', o.payment_status,
        'paymentMethod', o.payment_method,
        'orderType', o.order_type,
        'subtotal', o.subtotal,
        'discountTotal', o.discount_total,
        'totalAmount', coalesce(
          nullif(o.total_amount, 0),
          (
            select coalesce(
              sum(
                case
                  when oi.line_total > 0 then oi.line_total
                  else greatest(coalesce(oi.unit_price, 0) - coalesce(oi.discount_amount, 0), 0) * greatest(coalesce(oi.quantity, 1), 1)
                end
              ),
              0
            )
            from public.order_items oi
            where oi.order_id = o.id
          ),
          greatest(coalesce(o.subtotal, 0) - coalesce(o.discount_total, 0), 0)
        ),
        'placedAt', o.placed_at
      )
      order by o.placed_at desc
    ) as items
    from (
      select *
      from live_orders
      order by placed_at desc
      limit 10
    ) o
    left join public.profiles p on p.id = o.customer_id
  ),
  alerts as (
    select jsonb_agg(a.alert_obj) as items
    from (
      select jsonb_build_object(
        'id', ii.code,
        'type', 'warning',
        'tone', 'warning',
        'title', 'Low stock',
        'message', ii.name || ' (' || coalesce(ic.name, 'Uncategorized') || ') is low on stock'
      ) as alert_obj
      from public.inventory_items ii
      left join public.inventory_categories ic on ic.id = ii.category_id
      where ii.is_active = true
        and ii.quantity_on_hand <= ii.reorder_level
      order by ii.quantity_on_hand asc
      limit 10
    ) a
  )
  select jsonb_build_object(
    'sales', jsonb_build_object(
      'today', (select total from sales_today),
      'rangeTotal', (select total from sales_range),
      'averageOrderValue', round((select avg_value from avg_order_value), 2)
    ),
    'orders', jsonb_build_object(
      'today', (select today from order_counts),
      'rangeTotal', (select range_total from order_counts),
      'pending', (select pending from order_counts),
      'preparing', (select preparing from order_counts),
      'ready', (select ready from order_counts),
      'outForDelivery', (select out_for_delivery from order_counts),
      'completed', (select completed from order_counts),
      'cancelled', (select cancelled from order_counts)
    ),
    'topItems', coalesce((select items from top_items), '[]'::jsonb),
    'recentOrders', coalesce((select items from recent_orders), '[]'::jsonb),
    'alerts', coalesce((select items from alerts), '[]'::jsonb)
  )
  into result;

  return result;
end;
$$;

-- =========================================================
-- GRANTS (required for Supabase client access)
-- =========================================================

grant usage on schema public to anon, authenticated;

-- Read-only tables for anon users (customer app can browse menu without login).
grant select on table public.menu_categories to anon;
grant select on table public.menu_category_effective_state to anon;
grant select on table public.menu_items to anon;
grant select on table public.daily_menus to anon;
grant select on table public.daily_menu_items to anon;
grant select on table public.loyalty_rewards to anon;
grant select on table public.business_settings to anon;
grant select on table public.campaign_announcements to anon;
grant select on table public.menu_item_effective_availability to anon;
grant select on table public.loyalty_free_latte_items to anon;
grant execute on function public.menu_best_sellers(integer, integer) to anon;

-- Authenticated users can read/write; RLS policies still enforce access rules.
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

-- Views should be readable by both.
grant select on table public.menu_category_effective_state to authenticated;
grant select on table public.menu_item_effective_availability to authenticated;
grant select on table public.loyalty_free_latte_items to authenticated;
grant select on table public.dashboard_sales_feed to authenticated;

-- Refresh PostgREST schema cache after schema changes.
notify pgrst, 'reload schema';
