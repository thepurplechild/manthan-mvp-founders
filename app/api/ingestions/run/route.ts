// Human-in-the-loop ingestion pipeline endpoint. This endpoint executes the first TWO steps:
// Step 1: File parsing and structural analysis (script_preprocess)
// Step 2: Core elements extraction (core_extraction)
// Then pauses for founder review and approval. Requires CRON_SECRET header.
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

    // Execute STEP 1: File preprocessing (script_preprocess)
    await updateStep(supabase, ingestionId, 'script_preprocess', {
      status: 'running',
      started_at: new Date().toISOString(),
    });

    log('step1_preprocessing_start', { ingestion_id: ingestionId });

    // Parse the file using the ingestion core
    const parseResult = await ingestFile(
      ingestion.source_file_url.split('/').pop() || 'script',
      scriptBuffer,
      ingestion.mime_type || undefined,
      { extractMetadata: true }
    );

    if (!parseResult.success) {
      const errorMsg = parseResult.error?.message || 'File parsing failed';
      log('step1_preprocessing_failed', { ingestion_id: ingestionId, err: errorMsg });

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

    log('step1_preprocessing_complete', {
      ingestion_id: ingestionId,
      text_length: preprocessOutput.textContent.length,
    });

    // Update progress after step 1
    await supabase
      .from('ingestions')
      .update({
        status: 'processing',
        progress: 25,
        updated_at: new Date().toISOString(),
      })
      .eq('id', ingestionId);

    // Execute STEP 2: Core elements extraction (core_extraction)
    await updateStep(supabase, ingestionId, 'core_extraction', {
      status: 'running',
      started_at: new Date().toISOString(),
    });

    log('step2_core_extraction_start', { ingestion_id: ingestionId });

    // Import AI step function
    const { stepExtractElements } = await import('@/lib/ai/steps');

    let coreExtractionOutput;
    try {
      coreExtractionOutput = await stepExtractElements(preprocessOutput.textContent);

      log('step2_core_extraction_success', {
        ingestion_id: ingestionId,
        output_keys: Object.keys(coreExtractionOutput || {}),
      });

    } catch (extractError) {
      const errorMsg = extractError instanceof Error ? extractError.message : 'Core extraction failed';
      log('step2_core_extraction_failed', { ingestion_id: ingestionId, err: errorMsg });

      await updateStep(supabase, ingestionId, 'core_extraction', {
        status: 'failed',
        finished_at: new Date().toISOString(),
        error: errorMsg
      });

      await supabase
        .from('ingestions')
        .update({
          status: 'failed',
          error: `Core extraction failed: ${errorMsg}`,
          updated_at: new Date().toISOString(),
        })
        .eq('id', ingestionId);

      return NextResponse.json({ error: `Core extraction failed: ${errorMsg}` }, { status: 500 });
    }

    // Save core extraction output
    await updateStep(supabase, ingestionId, 'core_extraction', {
      status: 'succeeded',
      finished_at: new Date().toISOString(),
      output: {
        ...coreExtractionOutput,
        extractedAt: new Date().toISOString(),
      }
    });

    log('step2_core_extraction_complete', {
      ingestion_id: ingestionId,
    });

    // PAUSE: Update ingestion to pending_review after completing first TWO steps
    // The founder must now review and approve before triggering step 3 (character_bible)
    await supabase
      .from('ingestions')
      .update({
        status: 'pending_review',
        progress: 40,
        updated_at: new Date().toISOString(),
      })
      .eq('id', ingestionId);

    const totalDuration = Date.now() - startTime;

    log('initial_pipeline_complete', {
      ingestion_id: ingestionId,
      total_duration: totalDuration,
      steps_completed: ['script_preprocess', 'core_extraction'],
      next_step_requires_approval: 'character_bible',
    });

    return NextResponse.json({
      ok: true,
      ingestionId,
      message: 'Initial pipeline completed successfully. Steps 1-2 done. Founder review required for step 3.',
      duration: totalDuration,
      stepsCompleted: ['script_preprocess', 'core_extraction'],
      nextStep: 'character_bible',
      requiresFounderApproval: true,
      results: {
        preprocessing: {
          textLength: preprocessOutput.textContent.length,
          contentType: preprocessOutput.contentType,
          warnings: preprocessOutput.warnings.length
        },
        coreExtraction: {
          extractedElements: Object.keys(coreExtractionOutput || {}).length,
        }
      }
    });

  } catch (error) {
    const totalDuration = Date.now() - startTime;
    const message = error instanceof Error ? error.message : 'Unknown pipeline error';

    log('initial_pipeline_fatal_error', {
      ingestion_id: ingestionId,
      err: message,
      stack: error instanceof Error ? error.stack : undefined,
      total_duration: totalDuration,
    });

    // Mark current steps and ingestion as failed
    // Try to determine which step failed and mark appropriately
    try {
      // Check if preprocessing step is still running
      const { data: preprocessStep } = await supabase
        .from('ingestion_steps')
        .select('status')
        .eq('ingestion_id', ingestionId)
        .eq('name', 'script_preprocess')
        .single();

      if (preprocessStep?.status === 'running') {
        await updateStep(supabase, ingestionId, 'script_preprocess', {
          status: 'failed',
          finished_at: new Date().toISOString(),
          error: message
        });
      }

      // Check if core extraction step is running
      const { data: coreStep } = await supabase
        .from('ingestion_steps')
        .select('status')
        .eq('ingestion_id', ingestionId)
        .eq('name', 'core_extraction')
        .single();

      if (coreStep?.status === 'running') {
        await updateStep(supabase, ingestionId, 'core_extraction', {
          status: 'failed',
          finished_at: new Date().toISOString(),
          error: message
        });
      }
    } catch (updateError) {
      log('step_cleanup_error', {
        ingestion_id: ingestionId,
        err: updateError instanceof Error ? updateError.message : 'Step cleanup failed'
      });
    }

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
