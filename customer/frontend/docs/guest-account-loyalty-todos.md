# Guest Account Loyalty Backend TODO

The customer frontend now keeps guests out of account notifications and loyalty UI, stores normalized guest identity during checkout, and calls the authenticated merge path when a matching account/profile exists. The current Supabase schema still needs these backend pieces deployed for end-to-end guest loyalty accumulation:

- Add `orders.guest_phone_normalized text`, `orders.guest_email text`, and `orders.merged_to_customer_id uuid references public.profiles(id)` so guest orders can be matched later without exposing account history to anonymous users.
- Update `create_customer_order` to allow anonymous regular orders with `customer_id = null`, reject anonymous loyalty reward item claims, and persist `p_guest_phone_normalized` / `p_guest_email`.
- Add `get_guest_order_for_tracking(p_order_ref text)` that returns only one order-specific tracking payload and does not expose notification or order history.
- Add `merge_guest_orders_into_customer(p_guest_phone_normalized text, p_guest_email text)` as an authenticated RPC that links matching unmerged guest orders to `auth.uid()`, sets `merged_to_customer_id`, and backfills `loyalty_stamp_events` / `loyalty_accounts` for completed or delivered guest orders.
- Update loyalty stamp triggers/backfills so completed guest orders can be counted after merge, while guests still cannot select loyalty tables directly.
