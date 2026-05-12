-- =========================================================
-- CUSTOMER ORDER REVIEWS
-- Apply this after unified_schema.sql if your database is already deployed.
-- =========================================================

create table if not exists public.customer_order_reviews (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  customer_id uuid references public.profiles(id) on delete set null,
  reviewer_name text not null default 'Happy Tails Customer',
  service_label text not null default 'Cafe Order',
  rating integer not null constraint customer_order_reviews_rating_chk check (rating between 1 and 5),
  comment text not null constraint customer_order_reviews_comment_length_chk check (char_length(trim(comment)) between 1 and 800),
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.customer_order_reviews add column if not exists customer_id uuid references public.profiles(id) on delete set null;
alter table public.customer_order_reviews add column if not exists reviewer_name text not null default 'Happy Tails Customer';
alter table public.customer_order_reviews add column if not exists service_label text not null default 'Cafe Order';
alter table public.customer_order_reviews add column if not exists rating integer not null default 5;
alter table public.customer_order_reviews add column if not exists comment text not null default '';
alter table public.customer_order_reviews add column if not exists is_public boolean not null default true;
alter table public.customer_order_reviews add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'customer_order_reviews_rating_chk'
      and conrelid = 'public.customer_order_reviews'::regclass
  ) then
    alter table public.customer_order_reviews
      add constraint customer_order_reviews_rating_chk
      check (rating between 1 and 5);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'customer_order_reviews_comment_length_chk'
      and conrelid = 'public.customer_order_reviews'::regclass
  ) then
    alter table public.customer_order_reviews
      add constraint customer_order_reviews_comment_length_chk
      check (char_length(trim(comment)) between 1 and 800);
  end if;
end
$$;

create unique index if not exists idx_customer_order_reviews_order_unique
  on public.customer_order_reviews(order_id);
create index if not exists idx_customer_order_reviews_public_created_at
  on public.customer_order_reviews(is_public, created_at desc);
create index if not exists idx_customer_order_reviews_customer_created_at
  on public.customer_order_reviews(customer_id, created_at desc)
  where customer_id is not null;

drop trigger if exists trg_customer_order_reviews_updated_at on public.customer_order_reviews;
create trigger trg_customer_order_reviews_updated_at
before update on public.customer_order_reviews
for each row execute procedure public.set_updated_at();

create or replace function public.submit_customer_order_review(
  p_order_id uuid,
  p_rating integer,
  p_comment text,
  p_reviewer_name text default null,
  p_service_label text default null,
  p_guest_phone_normalized text default null,
  p_guest_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_order public.orders%rowtype;
  v_profile_name text;
  v_reviewer_name text;
  v_service_label text;
  v_comment text;
  v_rating integer;
  v_guest_phone text;
  v_guest_email text;
  v_order_guest_phone text;
  v_order_guest_email text;
  v_review public.customer_order_reviews%rowtype;
begin
  if p_order_id is null then
    raise exception 'Order is required for review.';
  end if;

  v_rating := coalesce(p_rating, 0);
  if v_rating < 1 or v_rating > 5 then
    raise exception 'Rating must be between 1 and 5 stars.';
  end if;

  v_comment := nullif(trim(coalesce(p_comment, '')), '');
  if v_comment is null then
    raise exception 'Review comment is required.';
  end if;

  if char_length(v_comment) > 800 then
    raise exception 'Review comment must be 800 characters or fewer.';
  end if;

  select *
    into v_order
  from public.orders
  where id = p_order_id
  limit 1;

  if not found then
    raise exception 'Order not found for review.';
  end if;

  if v_order.status not in ('completed', 'delivered') then
    raise exception 'Reviews are available after an order is completed.';
  end if;

  v_guest_phone := nullif(trim(coalesce(p_guest_phone_normalized, '')), '');
  v_guest_email := lower(nullif(trim(coalesce(p_guest_email, '')), ''));
  v_order_guest_phone := nullif(trim(coalesce(v_order.delivery_address ->> 'guestPhoneNormalized', '')), '');
  v_order_guest_email := lower(nullif(trim(coalesce(v_order.delivery_address ->> 'guestEmail', '')), ''));

  if v_order.customer_id is not null then
    if (v_actor_id is null or v_actor_id <> v_order.customer_id)
      and not public.is_owner_or_staff()
    then
      raise exception 'This review can only be submitted by the customer for this completed order.';
    end if;

    select p.name
      into v_profile_name
    from public.profiles p
    where p.id = v_order.customer_id
    limit 1;
  elsif not public.is_owner_or_staff()
    and not (
      (v_guest_phone is not null and v_order_guest_phone is not null and v_guest_phone = v_order_guest_phone)
      or (v_guest_email is not null and v_order_guest_email is not null and v_guest_email = v_order_guest_email)
    )
  then
    raise exception 'This review can only be submitted by the customer for this completed order.';
  end if;

  v_reviewer_name := coalesce(
    nullif(trim(coalesce(p_reviewer_name, '')), ''),
    nullif(trim(coalesce(v_profile_name, '')), ''),
    nullif(trim(coalesce(v_order.delivery_address ->> 'name', '')), ''),
    'Happy Tails Customer'
  );

  v_service_label := coalesce(
    nullif(trim(coalesce(p_service_label, '')), ''),
    case
      when v_order.order_type = 'delivery' then 'Delivery Order'
      when v_order.order_type = 'dine_in' then 'Cafe Visit'
      when v_order.order_type in ('pickup', 'takeout') then 'Shop Order'
      else 'Cafe Order'
    end
  );

  insert into public.customer_order_reviews (
    order_id,
    customer_id,
    reviewer_name,
    service_label,
    rating,
    comment,
    is_public
  )
  values (
    v_order.id,
    v_order.customer_id,
    v_reviewer_name,
    v_service_label,
    v_rating,
    v_comment,
    true
  )
  on conflict (order_id) do update
    set
      reviewer_name = excluded.reviewer_name,
      service_label = excluded.service_label,
      rating = excluded.rating,
      comment = excluded.comment,
      is_public = true,
      updated_at = now()
  returning * into v_review;

  return jsonb_build_object(
    'id', v_review.id,
    'order_id', v_review.order_id,
    'orderId', v_review.order_id,
    'customer_id', v_review.customer_id,
    'customerId', v_review.customer_id,
    'reviewer_name', v_review.reviewer_name,
    'reviewerName', v_review.reviewer_name,
    'service_label', v_review.service_label,
    'serviceLabel', v_review.service_label,
    'rating', v_review.rating,
    'comment', v_review.comment,
    'is_public', v_review.is_public,
    'isPublic', v_review.is_public,
    'created_at', v_review.created_at,
    'createdAt', v_review.created_at
  );
end;
$$;

alter table public.customer_order_reviews enable row level security;

drop policy if exists "customer_order_reviews_read_public_own_or_staff" on public.customer_order_reviews;
create policy "customer_order_reviews_read_public_own_or_staff"
on public.customer_order_reviews for select
using (
  is_public = true
  or customer_id = auth.uid()
  or public.is_owner_or_staff()
);

drop policy if exists "customer_order_reviews_manage_owner_staff" on public.customer_order_reviews;
create policy "customer_order_reviews_manage_owner_staff"
on public.customer_order_reviews for all
using (public.is_owner_or_staff())
with check (public.is_owner_or_staff());

grant select on table public.customer_order_reviews to anon;
grant select, insert, update, delete on table public.customer_order_reviews to authenticated;
grant execute on function public.submit_customer_order_review(uuid, integer, text, text, text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
