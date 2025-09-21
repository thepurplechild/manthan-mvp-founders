# Testing the New Cron Processor

## Setup Instructions

1. **Run the SQL setup first:**
   ```sql
   -- Execute this in your Supabase SQL Editor
   -- File: create-job-locks-table.sql
   ```

2. **Environment Variables Required:**
   ```env
   CRON_SECRET=your-secure-secret-here
   LOCK_TIMEOUT_MINUTES=5
   DEQUEUE_BATCH_SIZE=5
   ```

3. **Test the implementation:**

### Manual Test (Development)
```bash
# Test GET endpoint (only works in development)
curl -H "x-cron-secret: your-secret" http://localhost:3000/api/cron/process-jobs

# Or test POST endpoint
curl -X POST -H "x-cron-secret: your-secret" http://localhost:3000/api/cron/process-jobs
```

### Verify Database Lock Table
```sql
-- Check if the lock table was created
SELECT * FROM public.job_locks;

-- Check lock functions exist
SELECT proname FROM pg_proc WHERE proname LIKE '%processing_lock%';
```

### Expected Behavior

1. **No Jobs in Queue:**
   - Response: `{"ok": true, "processed": 0, "pending": 0, "lock_id": "..."}`
   - Logs: `queue_empty` event

2. **Jobs Available:**
   - Fetches up to 5 jobs with status='queued'
   - Marks them as 'running' atomically
   - Calls `/api/ingestions/run` for each job
   - Returns processing results

3. **Lock Mechanism:**
   - Only one cron instance can run at a time
   - Lock expires after 5 minutes (configurable)
   - Automatic cleanup of expired locks

4. **Error Handling:**
   - 4xx errors from processor → mark job as 'failed'
   - 5xx errors from processor → leave as 'running' for retry
   - Network errors → leave as 'running' for retry

## Key Improvements

1. **Database-First Approach:** Uses Supabase `ingestions` table directly instead of Vercel KV
2. **Atomic Locking:** Postgres-based locking with automatic expiration
3. **Race Condition Prevention:** Only updates jobs that are still 'queued'
4. **Comprehensive Logging:** Detailed logging for debugging
5. **Fire-and-Forget Processing:** Calls `/api/ingestions/run` without waiting for completion
6. **Robust Error Handling:** Different strategies for different error types

## Monitoring

Check the Vercel logs for events with `scope: "cron"`:
- `cron_start` - Job begins
- `lock_acquisition_result` - Lock status
- `found_queued_jobs` - Jobs found in queue
- `marked_jobs_running` - Jobs status updated
- `processor_response` - Response from `/api/ingestions/run`
- `cron_complete` - Job summary
- `cron_finished` - Total duration