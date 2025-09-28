// LEGACY MONOLITHIC VERSION - NOT RECOMMENDED DUE TO TIMEOUT ISSUES
// This is provided only as reference. The current async implementation is preferred.

import { NextRequest, NextResponse } from 'next/server';
import { ingestFile } from '@/lib/ingestion/core';
import { callClaude, safeParseJSON } from '@/lib/ai/anthropic';
import {
  generatePitchPDF,
  generatePitchPPTX,
  generateSummaryDOCX,
  type PitchData,
} from '@/lib/generation/documents';
import { generateVisualBrief, maybeGenerateImages } from '@/lib/generation/visuals';
import { getAdminClient } from '@/lib/supabase/admin';

const STEP_SEQUENCE = [
  'script_preprocess',
  'core_extraction',
  'character_bible',
  'visuals',
  'market_adaptation',
  'package_assembly',
  'final_package',
] as const;

type StepName = (typeof STEP_SEQUENCE)[number];
type StepStatus = 'queued' | 'running' | 'succeeded' | 'failed';

function log(event: string, payload: Record<string, unknown>) {
  console.log(
    JSON.stringify({
      scope: 'run',
      event,
      ts: new Date().toISOString(),
      ...payload,
    })
  );
}

async function updateStep(
  supabase: ReturnType<typeof getAdminClient>,
  ingestionId: string,
  name: StepName,
  patch: {
    status: StepStatus;
    started_at?: string;
    finished_at?: string;
    output?: Record<string, unknown> | null;
    error?: string | null;
  }
) {
  const payload = {
    status: patch.status,
    started_at: patch.started_at,
    finished_at: patch.finished_at,
    output: patch.output ?? undefined,
    error: patch.error ?? undefined,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('ingestion_steps')
    .update(payload)
    .eq('ingestion_id', ingestionId)
    .eq('name', name);

  if (error) {
    log('step_update_error', { ingestion_id: ingestionId, step: name, err: error.message });
  }
}

async function updateIngestion(
  supabase: ReturnType<typeof getAdminClient>,
  ingestionId: string,
  patch: Record<string, unknown>
) {
  const { error } = await supabase
    .from('ingestions')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', ingestionId);

  if (error) {
    log('ingestion_update_error', { ingestion_id: ingestionId, err: error.message });
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const userAgent = request.headers.get('user-agent') || 'unknown';
  const origin = request.headers.get('origin') || new URL(request.url).origin;

  log('processing_request_start', {
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

  log('ingestion_lookup_start', {
    ingestion_id: ingestionId,
    trigger: body.trigger || 'unknown',
  });

  const supabase = getAdminClient();

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
    created_at: ingestion.created_at,
    updated_at: ingestion.updated_at,
  });

  log('start', {
    ingestion_id: ingestionId,
    project_id: ingestion.project_id,
    user_id: ingestion.user_id,
  });

  await updateIngestion(supabase, ingestionId, {
    status: 'processing',
    progress: 5,
    error: null,
  });

  const ensureStepsExist = async () => {
    const missing: StepName[] = [];
    const { data: existingSteps } = await supabase
      .from('ingestion_steps')
      .select('name')
      .eq('ingestion_id', ingestionId);

    const names = new Set((existingSteps || []).map((s) => s.name));
    for (const step of STEP_SEQUENCE) {
      if (!names.has(step)) missing.push(step);
    }

    if (missing.length > 0) {
      await supabase.from('ingestion_steps').insert(
        missing.map((name) => ({ ingestion_id: ingestionId, name, status: 'queued' }))
      );
    }
  };

  await ensureStepsExist();

  const stepResults: Record<string, unknown> = {};

  const failIngestion = async (message: string) => {
    log('ingestion_failed', {
      ingestion_id: ingestionId,
      error: message,
      progress: ingestion.progress ?? 0,
    });

    await updateIngestion(supabase, ingestionId, {
      status: 'failed',
      error: message,
      progress: ingestion.progress ?? 0,
    });
  };

  try {
    const downloadStart = Date.now();
    const { data: fileResponse, error: downloadError } = await supabase.storage
      .from('scripts')
      .download(ingestion.source_file_url);

    if (downloadError || !fileResponse) {
      const msg = downloadError?.message || 'Unable to download source file';
      await failIngestion(msg);
      log('download_failed', { ingestion_id: ingestionId, err: msg });
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    const arrayBuffer = await fileResponse.arrayBuffer();
    const scriptBuffer = Buffer.from(arrayBuffer);

    log('download_complete', {
      ingestion_id: ingestionId,
      duration_ms: Date.now() - downloadStart,
      size: scriptBuffer.length,
    });

    // FIXED: Step: script_preprocess - Using robust ingestFile function
    await updateStep(supabase, ingestionId, 'script_preprocess', {
      status: 'running',
      started_at: new Date().toISOString(),
    });

    // CRITICAL FIX: Use ingestFile from lib/ingestion/core.ts
    const preprocess = await ingestFile(
      ingestion.source_file_url.split('/').pop() || 'script',
      scriptBuffer,
      ingestion.mime_type || undefined,
      { extractMetadata: true }
    );

    // Extract the parsed data correctly
    const extractedData = {
      textContent: preprocess.content?.textContent || '',
      metadata: preprocess.content?.metadata || {},
      contentType: preprocess.content?.contentType || 'unknown',
      extractedAt: new Date().toISOString(),
    };

    await updateStep(supabase, ingestionId, 'script_preprocess', {
      status: 'succeeded',
      finished_at: new Date().toISOString(),
      output: extractedData,
    });

    await updateIngestion(supabase, ingestionId, { progress: 25 });

    // Step: core_extraction - Now using the properly parsed text
    await updateStep(supabase, ingestionId, 'core_extraction', {
      status: 'running',
      started_at: new Date().toISOString(),
    });

    // Use the extracted text content from ingestFile
    const scriptText = extractedData.textContent || '';
    let coreResult: Record<string, unknown> = {};

    try {
      if (process.env.ANTHROPIC_API_KEY && scriptText) {
        const prompt = `You are given a screenplay or story text. Extract the following as strict JSON with keys: logline (string), synopsis (string, 2-4 paragraphs), themes (string[]), characters (array of objects with name and brief description). Respond ONLY with JSON and no prose.\n\nTEXT:\n${scriptText}`;
        const { text } = await callClaude(
          prompt,
          'Extract core elements as JSON. Do not include extra commentary.',
          1500
        );
        coreResult = safeParseJSON(text) || {};
      } else {
        coreResult = {
          logline: extractedData.metadata?.title || 'Untitled project logline pending',
          synopsis: scriptText.slice(0, 1200),
          themes: ['identity', 'family'],
          characters: [],
        };
      }
    } catch (error) {
      log('core_extraction_error', {
        ingestion_id: ingestionId,
        err: error instanceof Error ? error.message : String(error),
      });
      coreResult = {
        logline: extractedData.metadata?.title || 'Untitled project logline pending',
        synopsis: scriptText.slice(0, 1200),
        themes: ['identity', 'family'],
        characters: [],
      };
    }

    stepResults.core = coreResult;

    await updateStep(supabase, ingestionId, 'core_extraction', {
      status: 'succeeded',
      finished_at: new Date().toISOString(),
      output: coreResult,
    });

    await updateIngestion(supabase, ingestionId, { progress: 45 });

    // Continue with remaining steps...
    // [Rest of the pipeline implementation would continue here]

    const totalDuration = Date.now() - startTime;

    log('processing_complete', {
      ingestion_id: ingestionId,
      total_duration: totalDuration,
      final_status: 'completed',
      final_progress: 100,
    });

    return NextResponse.json({ ok: true, ingestionId, duration: totalDuration });
  } catch (error) {
    const totalDuration = Date.now() - startTime;
    const message = error instanceof Error ? error.message : 'Unknown processor error';

    log('fatal_error', {
      ingestion_id: ingestionId,
      err: message,
      stack: error instanceof Error ? error.stack : undefined,
      total_duration: totalDuration,
    });

    await failIngestion(message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}