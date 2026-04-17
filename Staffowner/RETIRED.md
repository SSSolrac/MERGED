The standalone Staffowner frontend has been merged into the unified customer app.

Active app:

```text
customer/frontend
```

Use the customer app scripts for local development and Vercel deployment:

```sh
cd customer/frontend
npm install
npm run dev
npm run build
```

Staff and owner users now sign in through the customer AuthModal. Role-based routes live under:

```text
/staff/...
/owner/...
```

The old Staffowner login page, auth provider, router, Vite config, and entry point are retained only as historical source references and are not part of the active app.
