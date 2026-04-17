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

Deploy with `customer/frontend` as the Vercel project root. Do not deploy `Staffowner/`.

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
dist
```

Framework preset:

```text
Vite
```

If the repository was imported from a parent wrapper folder that contains `CAFE_SYSTEM/`, set the Vercel Root Directory to:

```text
CAFE_SYSTEM/customer/frontend
```

The `vercel.json` file must live in the same directory Vercel is building. In this repo that means the active frontend root above, not the retired `Staffowner/` folder.
