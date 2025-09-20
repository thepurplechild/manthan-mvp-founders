# Ingestion Pipeline Runbook

```
┌──────────┐    upload file     ┌────────────┐      cron pop      ┌────────────┐
│  Upload  │ ─────────────────▶ │ KV Queue   │ ─────────────────▶ │ /run worker│
└──────────┘  (app/api/uploads) └────────────┘   (cron/process)    │  (service │
       │             ▲                │  enqueue jobs               │   role)   │
       │             │                ▼                            └────────────┘
       ▼        manual reset   ┌────────────┐       status API → UI polling
  Supabase ───────────────────▶│ Admin tool │
  (ingestions, steps, assets)  └────────────┘
```

## Environment Variables

| Name | Purpose |
|------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (browser + server) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (browser safe) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key – **server only** |
| `KV_QUEUE_KEY` | KV sorted set for ingestion jobs (default `ingestions:pipeline:queue`) |
| `KV_LOCK_KEY` | KV key for cron lock (default `ingestions:cron:lock`) |
| `CRON_SECRET` | Shared secret for cron ➜ run handshake |
| `ADMIN_TOKEN` | Token used by manual recovery endpoint |
| `DEQUEUE_BATCH_SIZE` | Jobs processed per cron tick (default `5`) |
| `PIPELINE_TIMEOUT_SEC` | Lock TTL and job timeout seconds (default `900`) |
| `RECOVERY_TIMEOUT_MIN` | Minutes before a job is considered stuck (default `15`) |

## Debug / Recovery Steps

1. **Confirm cron running**
   - `curl -X POST https://<app>/api/cron/process-jobs -H 'x-cron-secret: $CRON_SECRET'`
   - Inspect logs for `scope="cron" event="cron_complete"` entries.

2. **Check queue depth**
   - `curl https://<app>/api/cron/process-jobs -H 'x-cron-secret: $CRON_SECRET' -X POST`
   - Response includes `pending` and `processed` counts.

3. **Inspect pipeline status**
   - `curl "https://<app>/api/pipeline-status?ingestionId=<uuid>"`
   - Returns current step, progress, and error (if any).

4. **Force recovery of stuck jobs**
   - `curl -X POST https://<app>/api/admin/recover-stuck-jobs -H 'x-admin-token: $ADMIN_TOKEN'`
   - Jobs older than `RECOVERY_TIMEOUT_MIN` minutes in `queued`/`processing` reset to `queued` and re-enqueued.

5. **Manual invocation** (useful during QA)
   - `curl -X POST https://<app>/api/ingestions/run -H 'x-cron-secret: $CRON_SECRET' -H 'Content-Type: application/json' -d '{"ingestionId":"<uuid>"}'`

## Observability

All critical paths emit JSON logs:

- `scope=upload` – ingest enqueue requests
- `scope=queue` – KV enqueue/dequeue events
- `scope=cron` – cron execution, lock acquisition, processor responses
- `scope=run` – worker step transitions, downloads, asset generation
- `scope=status` – status API access
- `scope=admin-recovery` – manual reset activity

Use these fields to filter logs quickly in Vercel or your log sink.

## cURL Examples

```bash
# Trigger cron manually
curl -X POST "https://your-app.vercel.app/api/cron/process-jobs" \
  -H "x-cron-secret: $CRON_SECRET"

# Invoke the processor for a specific ingestion
curl -X POST "https://your-app.vercel.app/api/ingestions/run" \
  -H "x-cron-secret: $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"ingestionId":"00000000-0000-0000-0000-000000000000"}'

# Poll job status
curl "https://your-app.vercel.app/api/pipeline-status?ingestionId=00000000-0000-0000-0000-000000000000"

# Recover stuck work
curl -X POST "https://your-app.vercel.app/api/admin/recover-stuck-jobs" \
  -H "x-admin-token: $ADMIN_TOKEN"
```

Keep this file alongside deployment runbooks for quick operator reference.
