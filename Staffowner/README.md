# Staffowner Dashboard

A React + TypeScript dashboard built with Vite and TailwindCSS. This app connects directly to the shared Supabase backend (Auth + Postgres public schema) used by both Staffowner and Customer.

## Tech Stack

- React
- TypeScript
- Vite
- TailwindCSS
- React Router
- Sonner (toast notifications)

## Installation

```bash
npm install
```

## Development Commands

```bash
npm run dev
npm run build
```

## Folder Structure

```text
src/
  app/
    App.tsx
    router.tsx
  auth/
    AuthProvider.tsx
    LoginPage.tsx
  components/
    dashboard/
    navigation/
    ui/
  pages/
    DashboardPage.tsx
    ProfilePage.tsx
    SettingsPage.tsx
    admin/
  hooks/
  services/
  utils/
  types/
  assets/
```

## Demo Accounts

- `owner@happytails.com` (role: owner)
- `staff@happytails.com` (role: staff)
- Use the password configured in Supabase Auth

## Supabase Configuration

Set these env vars (see `.env`):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY` (or `VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY`)

## Troubleshooting

### Orders page: "stack depth limit exceeded"

If loading `/orders` fails and you see a Supabase/Postgres error like `54001: stack depth limit exceeded`, the issue is in the Supabase database (not the React app). This typically happens when Row Level Security (RLS) policies on `orders` and `order_items` reference each other (creating a recursion loop). Rewrite the RLS policies to remove circular references, then reload the app.
