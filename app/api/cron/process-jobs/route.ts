import { kv } from '@vercel/kv';
import { NextRequest, NextResponse } from 'next/server';

import {
  dequeueIngestionJobs,
  enqueueIngestionJob,
  ingestionQueueLength,
  type IngestionQueueItem,
} from '@/lib/jobs/queue';
import { getAdminClient } from '@/lib/supabase/admin';

const DEFAULT_BATCH_SIZE = Number(process.env.DEQUEUE_BATCH_SIZE || 5);
const LOCK_KEY = process.env.KV_LOCK_KEY || 'ingestions:cron:lock';
const CRON_SECRET = process.env.CRON_SECRET;
const PIPELINE_TIMEOUT_SEC = Number(process.env.PIPELINE_TIMEOUT_SEC || 900);

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

async function markIngestionFailed(ingestionId: string, message: string) {
  try {
    const supabase = getAdminClient();
    await supabase
      .from('ingestions')
      .update({
        status: 'failed',
        error: message,
        updated_at: new Date().toISOString(),
      })
      .eq('id', ingestionId);
  } catch (error) {
    log('mark_failed_error', {
      ingestion_id: ingestionId,
      err: error instanceof Error ? error.message : String(error),
    });
  }
}

async function invokeProcessor(origin: string, job: IngestionQueueItem) {
  const url = `${origin}/api/ingestions/run`;
  const body = JSON.stringify({ ingestionId: job.ingestionId, trigger: 'cron' });

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
    ingestion_id: job.ingestionId,
    status: response.status,
    ok: response.ok,
  });

  return { response, text };
}

export async function POST(request: NextRequest) {
  const start = Date.now();

  if (!CRON_SECRET) {
    log('config_error', { message: 'CRON_SECRET not configured', has_secret: false });
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const providedSecret = request.headers.get('x-cron-secret') || request.headers.get('authorization')?.replace('Bearer ', '');
  if (providedSecret !== CRON_SECRET) {
    log('auth_failed', { origin: request.headers.get('user-agent') });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const lockValue = `lock:${Date.now()}:${Math.random().toString(16).slice(2)}`;
  const lockResult = await kv.set(LOCK_KEY, lockValue, { nx: true, ex: PIPELINE_TIMEOUT_SEC });

  if (lockResult !== 'OK') {
    log('lock_held', {});
    return NextResponse.json({ ok: true, message: 'Lock held by another worker' });
  }

  const origin = new URL(request.url).origin;

  try {
    const batchSize = DEFAULT_BATCH_SIZE;
    const jobs = await dequeueIngestionJobs(batchSize);

    if (jobs.length === 0) {
      const pending = await ingestionQueueLength();
      log('queue_empty', { pending });
      return NextResponse.json({ ok: true, processed: 0, pending });
    }

    const results: Array<{ ingestionId: string; status: number; ok: boolean }> = [];

    for (const job of jobs) {
      try {
        const { response, text } = await invokeProcessor(origin, job);
        results.push({ ingestionId: job.ingestionId, status: response.status, ok: response.ok });

        if (!response.ok) {
          if (response.status >= 500) {
            await enqueueIngestionJob({
              ingestionId: job.ingestionId,
              projectId: job.projectId,
              userId: job.userId,
              attempts: job.attempts + 1,
            });
          } else {
            await markIngestionFailed(job.ingestionId, text || 'Processor rejected job');
          }
        }
      } catch (error) {
        log('processor_error', {
          ingestion_id: job.ingestionId,
          err: error instanceof Error ? error.message : String(error),
        });

        await enqueueIngestionJob({
          ingestionId: job.ingestionId,
          projectId: job.projectId,
          userId: job.userId,
          attempts: job.attempts + 1,
        });
      }
    }

    const duration = Date.now() - start;
    log('cron_complete', { processed: jobs.length, duration });

    return NextResponse.json({ ok: true, processed: jobs.length, results, duration });
  } finally {
    await kv.del(LOCK_KEY);
    log('lock_released', {});
  }
}

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return POST(request);
}
