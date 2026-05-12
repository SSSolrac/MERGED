# Customer App Deployment Readiness

Use this checklist when deploying the customer frontend against Supabase.

## Required environment
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## Canonical backend schema
- Source of truth: `supabase/unified_schema.sql`
- Must be applied to the target Supabase project.
- Required objects/features:
  - Trigger `public.handle_new_user_profile` on `auth.users` (auto-creates profiles, forces role=customer, assigns customer_code).
  - RPC `public.create_customer_order(...)` (atomic order + items + initial history).
  - Tables/views: `profiles`, `orders`, `order_items`, `order_status_history`, `menu_items`, `menu_categories`, `menu_item_effective_availability` (view), `daily_menus`, `daily_menu_items`, `loyalty_*`, `login_history`.
  - RLS policies as defined in the canonical schema (customers may read/write their own rows; no DELETE for orders).
  - Staff/owner promotion is **server-side only** (update `public.profiles.role` via service role/SQL); signup always yields `customer`.

## Expected behaviors if schema is missing
- Missing RPC/function → checkout will show a deployment message (“order system not fully deployed; apply unified_schema.sql”).
- Missing table/view/column → user-facing error points to applying the canonical schema.
- Backend unavailable/network → distinct “backend unavailable” messaging; does not invalidate an otherwise valid session.
- Invalid/expired session → prompts re-login.
- Permission/RLS denied → message points to RLS/grants for anon/authenticated roles.
- Legacy orders without history → timeline falls back to synthesized history (intentional).

## Deployment verification checklist
- [ ] Env vars set (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
  - Confirm the anon key matches the deployed project.
- [ ] Applied `supabase/unified_schema.sql` (no errors).
- [ ] RPC `public.create_customer_order` exists and is callable with anon key (authenticated context).
- [ ] Trigger `handle_new_user_profile` exists and inserts a profile on new signup.
- [ ] Staff/owner promotion tested via server-side role update (no client path).
- [ ] Checkout happy path succeeds (creates order, items, status history).
- [ ] Order history/track order loads without errors.
- [ ] Tests pass locally: `npm test`.
- [ ] (Optional) Build succeeds in deploy environment: `npm run build`.

## Troubleshooting quick map
- **backend unavailable**: Supabase URL/network outage. Verify project is up and CORS/network allowlist.
- **invalid session/auth failure**: Token expired/invalid; re-login.
- **missing RPC/function**: Ensure `public.create_customer_order` is present (apply canonical schema).
- **missing table/view/column**: Apply canonical schema; check Supabase migration state.
- **permission/RLS denied**: Verify RLS policies/grants for anon/authenticated and the caller’s role.
- **order has no history**: Legacy data; fallback timeline is intentional.
- **build fails with `spawn EPERM` (esbuild)**: Host environment blocked spawning `esbuild.exe` (seen on some locked-down Windows sandboxes). Verify the esbuild binary runs outside Node, allow it in AV/endpoint protection, or build on an environment where child process execution is permitted; app code/tests remain valid.

## Where to look in code
- Order creation RPC call: `src/services/orderService.js` (RPC `create_customer_order`).
- Auth/session validation and backend-unavailable handling: `src/services/authService.js`, `src/context/AuthContext.jsx`.
- Profile bootstrap retry on trigger timing: `src/services/profileService.js`.
- Error normalization/messages: `src/lib/supabaseErrors.js`.
