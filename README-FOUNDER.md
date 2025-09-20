# Founder Command Center

```
┌──────────────┐   Supabase (RLS)   ┌────────────────────┐
│ Next.js App  │ ─────────────────▶ │  Projects / Mandates│
│  /founder/*  │ ◀────────────────  │  Deal Pipeline      │
└──────────────┘     (SSR fetch)    └────────────────────┘
        │                                 │
        └── server actions ───────────────┘ (signed URLs, inserts)
```

## Setup
1. Ensure environment variables are configured:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `CRON_SECRET`, `ADMIN_TOKEN` (for background tasks)
2. Install dependencies and start the dev server:
   ```bash
   npm install
   npm run dev
   ```

## Tests
- Install test tooling:
  ```bash
  npm i -D vitest @testing-library/react @testing-library/user-event @testing-library/jest-dom zod @hookform/resolvers react-hook-form
  ```
- Add script (already present in `package.json`):
  ```json
  "test": "vitest --globals --environment=jsdom"
  ```
  - Run tests:
  ```bash
  npm run test
  ```

## Notes
- Founder-only pages are protected by `middleware.ts`, which validates the Supabase session and ensures `profiles.role === 'founder'` before allowing access.
- Server actions use the Supabase service client only for privileged operations such as generating signed URLs; all data reads respect RLS via cookie-bound clients.
