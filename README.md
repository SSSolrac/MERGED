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
Environment Variables: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_APP_URL
```

Use this exact production value for `VITE_APP_URL`:

```text
https://happytailspetcafe.vercel.app
```

Supabase Authentication URL Configuration should be:

```text
Site URL: https://happytailspetcafe.vercel.app
Redirect URLs:
- https://happytailspetcafe.vercel.app/auth/reset-password
- https://happytailspetcafe.vercel.app/auth/email-change
- http://127.0.0.1:5173/auth/reset-password
- http://127.0.0.1:5173/auth/email-change
```

Direct refreshes and deep links such as `/staff/...` and `/owner/...` are handled by the SPA rewrite in:

```text
vercel.json
```
