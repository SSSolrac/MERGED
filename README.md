# Happy Tails Cafe System

This repo contains one active deployable frontend app:

```text
customer/frontend
```

The old `Staffowner/` folder is retired and must not be used as the Vercel deployment target.

## Vercel

If this directory is your Git repository root, use these project settings:

```text
Root Directory: customer/frontend
Framework Preset: Vite
Build Command: npm run build
Output Directory: dist
Environment Variables: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
```

If you imported a parent wrapper folder that contains `CAFE_SYSTEM/`, set the Vercel Root Directory to:

```text
CAFE_SYSTEM/customer/frontend
```

Direct refreshes and deep links such as `/staff/...` and `/owner/...` are handled by the SPA rewrite in:

```text
customer/frontend/vercel.json
```
