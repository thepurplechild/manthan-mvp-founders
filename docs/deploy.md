# Deploy & Ops for India Market

## Environment
- Create `.env` locally from `.env.example`.
- Vercel envs (Production/Preview):
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `NEXT_PUBLIC_API_BASE` (if FastAPI)
  - `SENTRY_DSN` (optional)
  - `ANTHROPIC_API_KEY` (backend)

## CDN & Regions
- Prefer an India‑adjacent region (e.g., Singapore / Mumbai where available).
- Enable edge caching for `/api/trends` and `/api/recommendations` (short TTL + ETag).
- Serve static assets via Vercel CDN; large images via `next/image`.

## DB & Pooling
- Use Supabase built‑in pooler; for heavy workloads, colocate workers in same region.
- Consider pgBouncer if using direct Postgres.

## Backups
- Enable daily backups in Supabase. Practice restores to a staging project.

## Scaling
- Horizontal scale workers handling ingestion steps; queue retries with backoff.
- Use object storage for artifacts to keep stateless workers.

## PWA
- Manifest + service worker included. Offline shell caches `/` and `/offline.html`.

