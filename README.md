# Happy Tails Cafe System

This repo contains one active frontend app:

```text
customer/frontend
```

The old `Staffowner/` folder is retired and must not be used as the Vercel deployment target.

## Vercel

Deploy this repository from the `CAFE_SYSTEM` root. The root build proxies into the unified frontend in `customer/frontend`.

Use these project settings:

```text
Root Directory: .
Framework Preset: Vite
Build Command: npm run build
Output Directory: customer/frontend/dist
Environment Variables: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
```

Direct refreshes and deep links such as `/staff/...` and `/owner/...` are handled by the SPA rewrite in:

```text
vercel.json
```
