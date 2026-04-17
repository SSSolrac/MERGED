# Staffowner Dashboard (Retired)

This standalone app is no longer an active deployment target.

Use the unified frontend instead:

```text
customer/frontend
```

Vercel should build only the unified frontend root. Do not point Vercel at `Staffowner/`.

Current deployment settings:

```text
Root Directory: CAFE_SYSTEM
Framework Preset: Vite
Build Command: npm run build
Output Directory: customer/frontend/dist
```

Historical Staffowner source remains in this folder only for reference while the merged app continues to reuse pieces of it.
