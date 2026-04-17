# Happy Tails Unified Frontend

This is the single active Vite + React frontend for Happy Tails Pet Cafe. It serves customer, staff, and owner users from one deployable app, with the customer auth modal as the universal login UI.

## Local Setup

1. Install dependencies

```bash
npm install
```

2. Copy `.env.example` to `.env` and set your Supabase project values

```bash
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

3. Apply the shared Supabase SQL files in order:

```text
supabase/unified_schema.sql
supabase/delivery_area_schema.sql
```

4. Start the app

```bash
npm run dev
```

If you want to pin local development to `127.0.0.1:5173`, use:

```bash
npm run dev:strict
```

If that port is already in use, stop the stale Vite/Node process instead of starting a second frontend.

## Auth And Roles

- Public signup creates customer accounts only.
- Staff and owner users log in through the same customer auth UI.
- Staff/owner access is granted by updating `public.profiles.role` in Supabase.
- The old `Staffowner` Vite app is retired; do not run or deploy it separately.

## Vercel Deployment

Use the unified frontend only. Do not point Vercel at `Staffowner/`.

If your Git repository root contains `customer/` and `Staffowner/`, set:

```text
Root Directory: customer/frontend
Framework Preset: Vite
Build Command: npm run build
Output Directory: dist
Required env vars: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
```

If your Vercel project was imported from a parent wrapper folder that contains `CAFE_SYSTEM/`, use:

```text
Root Directory: CAFE_SYSTEM/customer/frontend
```

The included `vercel.json` rewrites all routes to `index.html` so direct refreshes on `/staff/...`, `/owner/...`, and protected customer routes resolve as SPA routes instead of returning `404: NOT_FOUND`.

## Delivery Notes

- Leaflet + OpenStreetMap is the only active map implementation.
- Customer delivery approval uses the database-backed delivery polygon plus active purok list.
- Saved profile addresses prefill house/unit + purok, but the exact delivery pin is still confirmed during checkout.

## Verification Commands

```bash
npm run lint
npm test
npm run build
```
