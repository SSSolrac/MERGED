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

The dev script binds to `127.0.0.1:5173` with `--strictPort` so stale Staffowner/customer dev servers cannot silently move the active app to another port. If port `5173` is already in use, stop the old Node/Vite process and rerun the command.

## Vercel

Deploy with `customer/frontend` as the Vercel project root.

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
