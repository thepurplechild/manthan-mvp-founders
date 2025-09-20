# Packaging Agent Backend

Serverless Python backend deployed on Vercel that orchestrates the packaging agent workflow using Supabase for persistence/storage and Anthropic Claude 3 Opus for content generation.

## Setup
1. Ensure Python 3.11 is available.
2. Create and activate a virtual environment:
   ```bash
   python3.11 -m venv .venv
   source .venv/bin/activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

## Environment Variables
Create a `.env.local` (used by `vercel dev`) containing:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SOURCE_BUCKET` (e.g., `source_scripts`)
- `GENERATED_BUCKET` (e.g., `generated_assets`)
- `ANTHROPIC_API_KEY`
- `ANTHROPIC_MODEL` (optional, default `claude-3-opus-20240229`)
- `JOB_CLAIM_LIMIT` (optional, default `2`)
- `LOG_LEVEL` (optional, default `INFO`)
- `WORKER_ID` (optional identifier for worker logs)

## Database Schema
Execute once (via Supabase SQL editor or `pg_execute`) to ensure required tables exist:

```sql
create table if not exists public.packaging_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id text not null,
  mandates jsonb,
  status text not null default 'queued' check (status in ('queued','processing','completed','failed')),
  error text,
  asset_path text,
  claimed_at timestamptz,
  completed_at timestamptz,
  worker_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.generated_assets (
  id uuid primary key default gen_random_uuid(),
  project_id text not null,
  asset_type text not null default 'docx',
  storage_path text not null,
  status text not null check (status in ('processing','completed','failed')),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.fn_claim_packaging_jobs(p_limit integer, p_worker_id text)
returns setof public.packaging_jobs
language plpgsql
as $$
  declare
    v_limit integer := greatest(p_limit, 1);
  begin
    return query
      with job_ids as (
        select id from public.packaging_jobs
        where status = 'queued'
        order by created_at asc
        for update skip locked
        limit v_limit
      )
      update public.packaging_jobs pj
      set status = 'processing',
          claimed_at = now(),
          updated_at = now(),
          worker_id = coalesce(p_worker_id, 'worker-' || left(uuid_generate_v4()::text, 8))
      from job_ids
      where pj.id = job_ids.id
      returning pj.*;
  end;
$$;
```

## Running Locally
1. Start Supabase emulators or ensure remote Supabase credentials are configured.
2. Launch Vercel dev server:
   ```bash
   vercel dev
   ```
   - `POST /api/run-packaging-agent` enqueues jobs.
   - `GET /api/packaging-worker` processes jobs (also triggered by cron in production).

For direct Flask execution during debugging:
```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... flask --app api/run-packaging-agent.py run
```

## Testing
Run unit tests with mocked Anthropic calls:
```bash
pytest -q
```

## Manual Flow
1. Upload `script.txt` (or `.md`/`.docx`) to `${SOURCE_BUCKET}/projects/{projectId}/source/`.
2. Enqueue a job:
   ```bash
   curl -X POST http://localhost:3000/api/run-packaging-agent \
     -H "Content-Type: application/json" \
     -d '{"projectId":"demo-1","mode":"sync"}'
   ```
3. Confirm generated `.docx` in `${GENERATED_BUCKET}/projects/{projectId}/generated/` and corresponding row in `generated_assets`.

## Deployment
Deploy via Vercel CLI:
```bash
vercel
vercel --prod
```
The included `vercel.json` registers a cron job (`*/5 * * * *`) that invokes `/api/packaging-worker` to process queued jobs.
