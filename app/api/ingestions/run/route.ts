// Human-in-the-loop ingestion preprocessor endpoint. This endpoint only executes
// the first step: file parsing and structural analysis. Requires CRON_SECRET header.
// Bypasses RLS using the Supabase service role key and must NEVER be exposed to end-users.

import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { ingestFile } from '@/lib/ingestion/core';

// Human-in-the-loop pipeline steps - only first step is automated
const STEP_SEQUENCE = [
  'script_preprocess',
  'core_extraction',
  'character_bible',
  'visuals',
  'market_adaptation',
  'package_assembly',
  'final_package'
] as const;

type StepName = (typeof STEP_SEQUENCE)[number];

function log(event: string, payload: Record<string, unknown>) {
  console.log(
    JSON.stringify({
      scope: 'preprocessor',
      event,
      ts: new Date().toISOString(),
      ...payload,
    })
  );
}

async function ensureStepsExist(
  supabase: ReturnType<typeof getAdminClient>,
  ingestionId: string
) {
  // Get existing steps
  const { data: existingSteps } = await supabase
    .from('ingestion_steps')
    .select('name')
    .eq('ingestion_id', ingestionId);

  const existingNames = new Set((existingSteps || []).map(s => s.name));
  const missing: StepName[] = [];

  // Check which steps are missing
  for (const step of STEP_SEQUENCE) {
    if (!existingNames.has(step)) {
      missing.push(step);
    }
  }

  // Create missing steps
  if (missing.length > 0) {
    const { error } = await supabase.from('ingestion_steps').insert(
      missing.map((name) => ({
        ingestion_id: ingestionId,
        name,
        status: 'queued'
      }))
    );

    if (error) {
      log('step_creation_error', { ingestion_id: ingestionId, err: error.message });
      throw new Error(`Failed to create ingestion steps: ${error.message}`);
    }

    log('steps_created', { ingestion_id: ingestionId, created: missing });
  }
}

async function updateStep(
  supabase: ReturnType<typeof getAdminClient>,
  ingestionId: string,
  stepName: StepName,
  patch: {
    status: 'queued' | 'running' | 'succeeded' | 'failed';
    started_at?: string;
    finished_at?: string;
    output?: Record<string, unknown> | null;
    error?: string | null;
  }
) {
  const { error } = await supabase
    .from('ingestion_steps')
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq('ingestion_id', ingestionId)
    .eq('name', stepName);

  if (error) {
    log('step_update_error', {
      ingestion_id: ingestionId,
      step: stepName,
      err: error.message
    });
    throw new Error(`Failed to update step ${stepName}: ${error.message}`);
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const userAgent = request.headers.get('user-agent') || 'unknown';
  const origin = request.headers.get('origin') || new URL(request.url).origin;

  log('preprocessor_request_start', {
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

  log('preprocessing_start', {
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
        progress: 5,
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

    // Ensure all pipeline steps exist in the database
    await ensureStepsExist(supabase, ingestionId);

    // Download the script file from Supabase Storage
    log('file_download_start', { ingestion_id: ingestionId });
    const { data: fileResponse, error: downloadError } = await supabase.storage
      .from('scripts')
      .download(ingestion.source_file_url);

    if (downloadError || !fileResponse) {
      const msg = downloadError?.message || 'Unable to download source file';
      log('download_failed', { ingestion_id: ingestionId, err: msg });

      await updateStep(supabase, ingestionId, 'script_preprocess', {
        status: 'failed',
        started_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
        error: msg
      });

      await supabase
        .from('ingestions')
        .update({
          status: 'failed',
          error: msg,
          updated_at: new Date().toISOString(),
        })
        .eq('id', ingestionId);

      return NextResponse.json({ error: msg }, { status: 500 });
    }

    const arrayBuffer = await fileResponse.arrayBuffer();
    const scriptBuffer = Buffer.from(arrayBuffer);

    log('download_complete', {
      ingestion_id: ingestionId,
      size: scriptBuffer.length,
    });

    // Execute ONLY the preprocessing step
    await updateStep(supabase, ingestionId, 'script_preprocess', {
      status: 'running',
      started_at: new Date().toISOString(),
    });

    log('preprocessing_execute', { ingestion_id: ingestionId });

    // Parse the file using the ingestion core
    const parseResult = await ingestFile(
      ingestion.source_file_url.split('/').pop() || 'script',
      scriptBuffer,
      ingestion.mime_type || undefined,
      { extractMetadata: true }
    );

    if (!parseResult.success) {
      const errorMsg = parseResult.error?.message || 'File parsing failed';
      log('preprocessing_failed', { ingestion_id: ingestionId, err: errorMsg });

      await updateStep(supabase, ingestionId, 'script_preprocess', {
        status: 'failed',
        finished_at: new Date().toISOString(),
        error: errorMsg
      });

      await supabase
        .from('ingestions')
        .update({
          status: 'failed',
          error: errorMsg,
          updated_at: new Date().toISOString(),
        })
        .eq('id', ingestionId);

      return NextResponse.json({ error: errorMsg }, { status: 500 });
    }

    // Save the parsed output to the database
    const preprocessOutput = {
      textContent: parseResult.content?.textContent || '',
      metadata: parseResult.content?.metadata || {},
      contentType: parseResult.content?.contentType || 'unknown',
      checksum: parseResult.content?.checksum,
      extractedAt: new Date().toISOString(),
      warnings: parseResult.warnings || []
    };

    await updateStep(supabase, ingestionId, 'script_preprocess', {
      status: 'succeeded',
      finished_at: new Date().toISOString(),
      output: preprocessOutput
    });

    // Update ingestion to pending review for founder to trigger next step
    await supabase
      .from('ingestions')
      .update({
        status: 'pending_review',
        progress: 15,
        updated_at: new Date().toISOString(),
      })
      .eq('id', ingestionId);

    const totalDuration = Date.now() - startTime;

    log('preprocessing_complete', {
      ingestion_id: ingestionId,
      total_duration: totalDuration,
      text_length: preprocessOutput.textContent.length,
    });

    return NextResponse.json({
      ok: true,
      ingestionId,
      message: 'File preprocessing completed successfully. Ready for founder review.',
      duration: totalDuration,
      nextStep: 'core_extraction',
      preprocessResult: {
        textLength: preprocessOutput.textContent.length,
        contentType: preprocessOutput.contentType,
        warnings: preprocessOutput.warnings.length
      }
    });

  } catch (error) {
    const totalDuration = Date.now() - startTime;
    const message = error instanceof Error ? error.message : 'Unknown preprocessing error';

    log('preprocessing_fatal_error', {
      ingestion_id: ingestionId,
      err: message,
      stack: error instanceof Error ? error.stack : undefined,
      total_duration: totalDuration,
    });

    // Mark preprocessing step and ingestion as failed
    await updateStep(supabase, ingestionId, 'script_preprocess', {
      status: 'failed',
      finished_at: new Date().toISOString(),
      error: message
    });

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
