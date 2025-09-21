import { NextRequest, NextResponse } from 'next/server';
import { createId } from '@paralleldrive/cuid2';
import { getAdminClient } from '@/lib/supabase/admin';

const DEFAULT_BATCH_SIZE = Number(process.env.DEQUEUE_BATCH_SIZE || 5);
const CRON_SECRET = process.env.CRON_SECRET;
const LOCK_TIMEOUT_MINUTES = Number(process.env.LOCK_TIMEOUT_MINUTES || 5);

function log(event: string, payload: Record<string, unknown>) {
  console.log(
    JSON.stringify({
      scope: 'cron',
      event,
      ts: new Date().toISOString(),
      ...payload,
    })
  );
}

interface QueuedIngestion {
  id: string;
  user_id: string;
  project_id: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

async function acquireLock(supabase: ReturnType<typeof getAdminClient>, lockId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('acquire_processing_lock', {
      p_lock_id: lockId,
      p_locked_by: `cron-worker-${process.env.VERCEL_REGION || 'unknown'}`,
      p_timeout_minutes: LOCK_TIMEOUT_MINUTES,
    });

    if (error) {
      log('lock_acquisition_error', { err: error.message });
      return false;
    }

    log('lock_acquisition_result', { acquired: data, lock_id: lockId });
    return Boolean(data);
  } catch (error) {
    log('lock_acquisition_exception', {
      err: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

async function releaseLock(supabase: ReturnType<typeof getAdminClient>, lockId: string): Promise<void> {
  try {
    const { data, error } = await supabase.rpc('release_processing_lock', {
      p_lock_id: lockId,
    });

    if (error) {
      log('lock_release_error', { err: error.message, lock_id: lockId });
    } else {
      log('lock_released', { released: data, lock_id: lockId });
    }
  } catch (error) {
    log('lock_release_exception', {
      err: error instanceof Error ? error.message : String(error),
      lock_id: lockId,
    });
  }
}

async function fetchQueuedJobs(supabase: ReturnType<typeof getAdminClient>, batchSize: number): Promise<QueuedIngestion[]> {
  try {
    const { data, error } = await supabase
      .from('ingestions')
      .select('id, user_id, project_id, status, created_at, updated_at')
      .eq('status', 'queued')
      .order('created_at', { ascending: true })
      .limit(batchSize);

    if (error) {
      log('fetch_queued_jobs_error', { err: error.message });
      return [];
    }

    return data || [];
  } catch (error) {
    log('fetch_queued_jobs_exception', {
      err: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

async function markJobsAsRunning(supabase: ReturnType<typeof getAdminClient>, jobIds: string[]): Promise<string[]> {
  if (jobIds.length === 0) return [];

  try {
    const { data, error } = await supabase
      .from('ingestions')
      .update({
        status: 'running',
        updated_at: new Date().toISOString(),
      })
      .in('id', jobIds)
      .eq('status', 'queued') // Only update if still queued (prevents race conditions)
      .select('id');

    if (error) {
      log('mark_jobs_running_error', { err: error.message, job_ids: jobIds });
      return [];
    }

    const updatedIds = (data || []).map(job => job.id);
    log('marked_jobs_running', { updated_count: updatedIds.length, job_ids: updatedIds });
    return updatedIds;
  } catch (error) {
    log('mark_jobs_running_exception', {
      err: error instanceof Error ? error.message : String(error),
      job_ids: jobIds,
    });
    return [];
  }
}

async function markIngestionFailed(supabase: ReturnType<typeof getAdminClient>, ingestionId: string, message: string): Promise<void> {
  try {
    await supabase
      .from('ingestions')
      .update({
        status: 'failed',
        error: message,
        updated_at: new Date().toISOString(),
      })
      .eq('id', ingestionId);

    log('marked_ingestion_failed', { ingestion_id: ingestionId, error: message });
  } catch (error) {
    log('mark_failed_error', {
      ingestion_id: ingestionId,
      err: error instanceof Error ? error.message : String(error),
    });
  }
}

async function invokeProcessor(origin: string, ingestionId: string): Promise<{ response: Response; text: string }> {
  const url = `${origin}/api/ingestions/run`;
  const body = JSON.stringify({ ingestionId, trigger: 'cron' });

  log('invoking_processor', { ingestion_id: ingestionId, url });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-cron-secret': CRON_SECRET || '',
    },
    body,
  });

  const text = await response.text();

  log('processor_response', {
    ingestion_id: ingestionId,
    status: response.status,
    ok: response.ok,
    response_size: text.length,
  });

  return { response, text };
}

export async function POST(request: NextRequest) {
  const start = Date.now();
  const lockId = createId();

  log('cron_start', { lock_id: lockId, batch_size: DEFAULT_BATCH_SIZE });

  if (!CRON_SECRET) {
    log('config_error', { message: 'CRON_SECRET not configured', has_secret: false });
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const providedSecret = request.headers.get('x-cron-secret') || request.headers.get('authorization')?.replace('Bearer ', '');
  if (providedSecret !== CRON_SECRET) {
    log('auth_failed', { origin: request.headers.get('user-agent') });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdminClient();
  const origin = new URL(request.url).origin;

  // Try to acquire the processing lock
  const lockAcquired = await acquireLock(supabase, lockId);
  if (!lockAcquired) {
    log('lock_held', { lock_id: lockId });
    return NextResponse.json({ ok: true, message: 'Lock held by another worker', lock_id: lockId });
  }

  try {
    // Fetch queued jobs from the database
    const queuedJobs = await fetchQueuedJobs(supabase, DEFAULT_BATCH_SIZE);

    if (queuedJobs.length === 0) {
      // Check total pending count for logging
      const { count } = await supabase
        .from('ingestions')
        .select('id', { count: 'exact' })
        .eq('status', 'queued');

      log('queue_empty', { pending: count || 0 });
      return NextResponse.json({ ok: true, processed: 0, pending: count || 0, lock_id: lockId });
    }

    log('found_queued_jobs', { count: queuedJobs.length });

    // Mark jobs as running (atomic operation to prevent race conditions)
    const jobIds = queuedJobs.map(job => job.id);
    const updatedJobIds = await markJobsAsRunning(supabase, jobIds);

    if (updatedJobIds.length === 0) {
      log('no_jobs_updated', { reason: 'All jobs may have been picked up by another worker' });
      return NextResponse.json({ ok: true, processed: 0, message: 'No jobs updated', lock_id: lockId });
    }

    // Process each job by calling the processor endpoint
    const results: Array<{ ingestionId: string; status: number; ok: boolean; error?: string }> = [];

    for (const ingestionId of updatedJobIds) {
      try {
        log('processing_job', { ingestion_id: ingestionId });

        // Make fire-and-forget call to the processor
        const { response, text } = await invokeProcessor(origin, ingestionId);
        results.push({
          ingestionId,
          status: response.status,
          ok: response.ok,
          error: response.ok ? undefined : text.slice(0, 200) // Truncate error for logging
        });

        if (!response.ok) {
          log('processor_rejected_job', {
            ingestion_id: ingestionId,
            status: response.status,
            error: text.slice(0, 200),
          });

          // For non-retriable errors (4xx), mark as failed
          if (response.status >= 400 && response.status < 500) {
            await markIngestionFailed(supabase, ingestionId, text || 'Processor rejected job');
          }
          // For 5xx errors, leave as 'running' to be retried by another cron run
        }

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        log('processor_error', {
          ingestion_id: ingestionId,
          err: errorMessage,
        });

        results.push({
          ingestionId,
          status: 500,
          ok: false,
          error: errorMessage
        });

        // For network/infrastructure errors, leave the job in 'running' state
        // so it can be retried by a future cron run or manual intervention
      }
    }

    const duration = Date.now() - start;
    const successCount = results.filter(r => r.ok).length;
    const errorCount = results.filter(r => !r.ok).length;

    log('cron_complete', {
      processed: updatedJobIds.length,
      success: successCount,
      errors: errorCount,
      duration,
      lock_id: lockId
    });

    return NextResponse.json({
      ok: true,
      processed: updatedJobIds.length,
      success: successCount,
      errors: errorCount,
      results: results.map(r => ({
        ingestionId: r.ingestionId,
        status: r.status,
        ok: r.ok
      })), // Exclude error details from response
      duration,
      lock_id: lockId
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log('cron_fatal_error', { err: errorMessage, lock_id: lockId });

    return NextResponse.json({
      error: 'Cron job failed',
      message: errorMessage,
      lock_id: lockId
    }, { status: 500 });

  } finally {
    // Always release the lock
    await releaseLock(supabase, lockId);

    const totalDuration = Date.now() - start;
    log('cron_finished', { total_duration: totalDuration, lock_id: lockId });
  }
}

export async function GET(request: NextRequest) {
  // Allow GET for development testing
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'GET method forbidden in production' }, { status: 403 });
  }

  log('dev_mode_get_request', { user_agent: request.headers.get('user-agent') });
  return POST(request);
}