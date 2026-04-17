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

The app binds to `127.0.0.1:5173` with `--strictPort`. If that port is already in use, stop the stale Vite/Node process instead of starting a second frontend.

## Auth And Roles

- Public signup creates customer accounts only.
- Staff and owner users log in through the same customer auth UI.
- Staff/owner access is granted by updating `public.profiles.role` in Supabase.
- The old `Staffowner` Vite app is retired; do not run or deploy it separately.

## Vercel Deployment

Use `customer/frontend` as the Vercel project root.

```text
Build command: npm run build
Output directory: dist
Required env vars: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
```

The included `vercel.json` rewrites all routes to `index.html` so direct refreshes on `/staff/...`, `/owner/...`, and protected customer routes work as SPA routes.

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
