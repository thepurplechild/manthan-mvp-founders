// Server-to-server ingestion processor. This endpoint is invoked by the cron worker
// and requires the CRON_SECRET header. It bypasses RLS using the Supabase service
// role key and must NEVER be exposed to end-users.

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

    // Step: script_preprocess
    await updateStep(supabase, ingestionId, 'script_preprocess', {
      status: 'running',
      started_at: new Date().toISOString(),
    });

    const preprocess = await ingestFile(
      ingestion.source_file_url.split('/').pop() || 'script',
      scriptBuffer,
      ingestion.mime_type || undefined,
      { extractMetadata: true }
    );

    await updateStep(supabase, ingestionId, 'script_preprocess', {
      status: 'succeeded',
      finished_at: new Date().toISOString(),
      output: {
        metadata: preprocess.content?.metadata,
        contentType: preprocess.content?.contentType,
      },
    });

    await updateIngestion(supabase, ingestionId, { progress: 25 });

    // Step: core_extraction
    await updateStep(supabase, ingestionId, 'core_extraction', {
      status: 'running',
      started_at: new Date().toISOString(),
    });

    const scriptText = preprocess.content?.textContent || '';
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
          logline: preprocess.content?.metadata?.title || 'Untitled project logline pending',
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
        logline: preprocess.content?.metadata?.title || 'Untitled project logline pending',
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

    // Step: character_bible
    await updateStep(supabase, ingestionId, 'character_bible', {
      status: 'running',
      started_at: new Date().toISOString(),
    });

    let bible: Record<string, unknown> = {};
    try {
      if (process.env.ANTHROPIC_API_KEY) {
        const { text } = await callClaude(
          `Using the following core elements JSON, generate a CHARACTER_BIBLE as strict JSON with keys: characters (array of objects each with name, motivations, conflicts, relationships (array), arc, cultural_context). Respond ONLY with JSON.\n\nCORE_ELEMENTS_JSON:\n${JSON.stringify(coreResult)}`,
          'Expand core elements into a detailed character bible as JSON.',
          1500
        );
        bible = safeParseJSON(text) || {};
      } else {
        bible = {
          characters: [
            {
              name: 'Protagonist',
              motivations: ['prove self'],
              conflicts: ['family pressure'],
              arc: 'from doubt to purpose',
            },
          ],
        };
      }
    } catch (error) {
      log('character_bible_error', {
        ingestion_id: ingestionId,
        err: error instanceof Error ? error.message : String(error),
      });
      bible = {
        characters: [
          {
            name: 'Protagonist',
            motivations: ['prove self'],
            conflicts: ['family pressure'],
            arc: 'from doubt to purpose',
          },
        ],
      };
    }

    stepResults.bible = bible;

    await updateStep(supabase, ingestionId, 'character_bible', {
      status: 'succeeded',
      finished_at: new Date().toISOString(),
      output: bible,
    });

    await updateIngestion(supabase, ingestionId, { progress: 60 });

    // Step: visuals
    await updateStep(supabase, ingestionId, 'visuals', {
      status: 'running',
      started_at: new Date().toISOString(),
    });

    let visualsOutput: Record<string, unknown> = {};
    try {
      visualsOutput = await generateVisualBrief(coreResult as any);
      visualsOutput.images = await maybeGenerateImages([]);
    } catch (error) {
      log('visuals_error', {
        ingestion_id: ingestionId,
        err: error instanceof Error ? error.message : String(error),
      });
      visualsOutput = { concepts: [] };
    }

    stepResults.visuals = visualsOutput;

    await updateStep(supabase, ingestionId, 'visuals', {
      status: 'succeeded',
      finished_at: new Date().toISOString(),
      output: visualsOutput,
    });

    await updateIngestion(supabase, ingestionId, { progress: 70 });

    // Step: market_adaptation (placeholder)
    await updateStep(supabase, ingestionId, 'market_adaptation', {
      status: 'running',
      started_at: new Date().toISOString(),
    });

    const marketAdaptation = {
      recommendations: [
        { platform: 'Netflix', rationale: 'Strong family drama slate needs fresh voices' },
        { platform: 'Amazon', rationale: 'Action beat resonates with current India Originals push' },
      ],
    };

    stepResults.market = marketAdaptation;

    await updateStep(supabase, ingestionId, 'market_adaptation', {
      status: 'succeeded',
      finished_at: new Date().toISOString(),
      output: marketAdaptation,
    });

    await updateIngestion(supabase, ingestionId, { progress: 80 });

    // Step: package_assembly
    await updateStep(supabase, ingestionId, 'package_assembly', {
      status: 'running',
      started_at: new Date().toISOString(),
    });

    const pitchData: PitchData = {
      title:
        ingestion.title ||
        (coreResult.title as string | undefined) ||
        ingestion.source_file_url.split('/').pop() ||
        'Pitch Deck',
      logline: (coreResult.logline as string) || '',
      synopsis: (coreResult.synopsis as string) || '',
      themes: (coreResult.themes as string[]) || [],
      genres: (coreResult.genres as string[]) || [],
      characters: (bible.characters as any) || [],
      marketTags: (marketAdaptation.recommendations || []).map((r) => r.platform),
    };

    const baseDir = `generated-assets/${ingestion.user_id}/${ingestionId}`;
    try {
      const [pdfBuffer, pptxBuffer, docxBuffer] = await Promise.all([
        generatePitchPDF(pitchData),
        generatePitchPPTX(pitchData),
        generateSummaryDOCX(pitchData),
      ]);

      await supabase.storage
        .from('generated-assets')
        .upload(`${baseDir}/pitch.pdf`, pdfBuffer, {
          contentType: 'application/pdf',
          upsert: true,
        });
      await supabase.storage
        .from('generated-assets')
        .upload(`${baseDir}/pitch.pptx`, pptxBuffer, {
          contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          upsert: true,
        });
      await supabase.storage
        .from('generated-assets')
        .upload(`${baseDir}/summary.docx`, docxBuffer, {
          contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          upsert: true,
        });

      stepResults.assets = {
        pdf: `${baseDir}/pitch.pdf`,
        pptx: `${baseDir}/pitch.pptx`,
        docx: `${baseDir}/summary.docx`,
      };
    } catch (error) {
      log('asset_upload_error', {
        ingestion_id: ingestionId,
        err: error instanceof Error ? error.message : String(error),
      });
    }

    await updateStep(supabase, ingestionId, 'package_assembly', {
      status: 'succeeded',
      finished_at: new Date().toISOString(),
      output: (stepResults.assets || {}) as Record<string, unknown>,
    });

    await updateIngestion(supabase, ingestionId, { progress: 93 });

    // Final package marker
    await updateStep(supabase, ingestionId, 'final_package', {
      status: 'succeeded',
      finished_at: new Date().toISOString(),
      output: {
        ready: true,
        assets: stepResults.assets,
      },
    });

    await updateIngestion(supabase, ingestionId, {
      status: 'completed',
      progress: 100,
      error: null,
    });

    log('completed', { ingestion_id: ingestionId });

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
