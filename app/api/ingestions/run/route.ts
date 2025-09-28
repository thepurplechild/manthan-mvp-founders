// Job orchestrator endpoint. This endpoint creates processing jobs for ingestions
// and requires the CRON_SECRET header. It bypasses RLS using the Supabase service
// role key and must NEVER be exposed to end-users.

import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';

// Processing steps for the new async workflow
const PROCESSING_STEPS = [
  'extract_text',
  'generate_summary',
  'create_action_items',
  'finalize'
] as const;

type ProcessingStep = (typeof PROCESSING_STEPS)[number];

function log(event: string, payload: Record<string, unknown>) {
  console.log(
    JSON.stringify({
      scope: 'orchestrator',
      event,
      ts: new Date().toISOString(),
      ...payload,
    })
  );
}

async function createProcessingJobs(
  supabase: ReturnType<typeof getAdminClient>,
  ingestionId: string
) {
  // Call the database function to create processing jobs
  const { error } = await supabase.rpc('create_processing_jobs', {
    p_ingestion_id: ingestionId
  });

  if (error) {
    log('job_creation_error', { ingestion_id: ingestionId, err: error.message });
    throw new Error(`Failed to create processing jobs: ${error.message}`);
  }

  log('jobs_created', { ingestion_id: ingestionId, steps: PROCESSING_STEPS });
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const userAgent = request.headers.get('user-agent') || 'unknown';
  const origin = request.headers.get('origin') || new URL(request.url).origin;

  log('orchestrator_request_start', {
    user_agent: userAgent,
    origin,
    has_cron_secret: Boolean(process.env.CRON_SECRET),
  });

  if (!process.env.CRON_SECRET) {
    log('config_error', { has_secret: false });
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }

  const headerSecret =
    request.headers.get('x-cron-secret') ||
    request.headers.get('authorization')?.replace('Bearer ', '') ||
    '';

  if (headerSecret !== process.env.CRON_SECRET) {
    log('auth_failed', {
      provided: Boolean(headerSecret),
      user_agent: userAgent,
      origin,
    });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  log('auth_success', {
    user_agent: userAgent,
    authenticated: true,
  });

  let body: { ingestionId?: string; ingestion_id?: string; trigger?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const ingestionId = body.ingestionId || body.ingestion_id;
  if (!ingestionId) {
    log('invalid_request', { reason: 'Missing ingestionId', body });
    return NextResponse.json({ error: 'Missing ingestionId' }, { status: 400 });
  }

  log('job_orchestration_start', {
    ingestion_id: ingestionId,
    trigger: body.trigger || 'unknown',
  });

  const supabase = getAdminClient();

  // Verify ingestion exists
  const { data: ingestion, error: fetchError } = await supabase
    .from('ingestions')
    .select('*')
    .eq('id', ingestionId)
    .maybeSingle();

  if (fetchError || !ingestion) {
    log('ingestion_missing', {
      ingestion_id: ingestionId,
      err: fetchError?.message,
      fetch_error_code: fetchError?.code,
    });
    return NextResponse.json({ error: 'Ingestion not found' }, { status: 404 });
  }

  log('ingestion_found', {
    ingestion_id: ingestionId,
    user_id: ingestion.user_id,
    project_id: ingestion.project_id,
    current_status: ingestion.status,
    current_progress: ingestion.progress,
  });

  try {
    // Update ingestion status to processing with initial progress
    const { error: updateError } = await supabase
      .from('ingestions')
      .update({
        status: 'processing',
        progress: 10,
        error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', ingestionId);

    if (updateError) {
      log('ingestion_update_error', {
        ingestion_id: ingestionId,
        err: updateError.message
      });
      return NextResponse.json({ error: 'Failed to update ingestion status' }, { status: 500 });
    }

    // Create processing jobs for this ingestion
    await createProcessingJobs(supabase, ingestionId);

    const totalDuration = Date.now() - startTime;

    log('orchestration_complete', {
      ingestion_id: ingestionId,
      total_duration: totalDuration,
      jobs_created: PROCESSING_STEPS.length,
    });

    return NextResponse.json({
      ok: true,
      ingestionId,
      jobsCreated: PROCESSING_STEPS.length,
      message: 'Processing jobs created successfully',
      duration: totalDuration
    });

  } catch (error) {
    const totalDuration = Date.now() - startTime;
    const message = error instanceof Error ? error.message : 'Unknown orchestrator error';

    log('orchestration_failed', {
      ingestion_id: ingestionId,
      err: message,
      stack: error instanceof Error ? error.stack : undefined,
      total_duration: totalDuration,
    });

    // Mark ingestion as failed
    await supabase
      .from('ingestions')
      .update({
        status: 'failed',
        error: message,
        updated_at: new Date().toISOString(),
      })
      .eq('id', ingestionId);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
