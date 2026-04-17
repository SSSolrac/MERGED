# Unified Frontend App

`customer/frontend` is the only active deployable frontend app.

## Auth

The customer `AuthModal` is the universal login UI for customer, staff, and owner users.

Public signup remains customer-only. The Supabase schema creates every public signup with `public.profiles.role = 'customer'`; staff and owner access must be granted server-side by updating `public.profiles.role`.

Role resolution is centralized in:

```text
src/services/auth/getCurrentUserRole.js
```

The role is read from:

```sql
public.profiles.role
```

## Routes

Customer routes remain at the public/customer paths:

```text
/
/menu
/profile/info
/profile/loyalty
/order-history
```

Staff and owner routes are now part of this same app:

```text
/staff/...
/owner/...
```

The old `Staffowner` Vite app is retired and is not part of active routing or deployment.

## Local Development

Run only the unified app:

```bash
cd customer/frontend
npm run dev
```

If you need the old fixed-port behavior locally, run:

```bash
npm run dev:strict
```

That command binds to `127.0.0.1:5173` with `--strictPort` so stale Staffowner/customer dev servers cannot silently move the active app to another port. If port `5173` is already in use, stop the old Node/Vite process and rerun the command.

## Vercel

Deploy from the `CAFE_SYSTEM` repository root. Do not deploy `Staffowner/`.

Required environment variables:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

Build command:

```text
npm run build
```

Output directory:

```text
customer/frontend/dist
```

Framework preset:

```text
Vite
```

If the repository was imported from a parent wrapper folder that contains `CAFE_SYSTEM/`, set the Vercel Root Directory to:

```text
CAFE_SYSTEM
```

The active `vercel.json` file now lives at the `CAFE_SYSTEM` repo root so Vercel has one unambiguous build target while the actual app source continues to live in `customer/frontend`.
