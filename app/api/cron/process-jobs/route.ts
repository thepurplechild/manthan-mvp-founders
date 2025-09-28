// Asynchronous job processor that runs every minute via cron
// Processes queued jobs from the processing_jobs table one at a time
// Implements exponential backoff retry logic and proper error handling

import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { ingestFile } from '@/lib/ingestion/core';
import { callClaude, safeParseJSON } from '@/lib/ai/anthropic';
import {
  generatePitchPDF,
  generatePitchPPTX,
  generateSummaryDOCX,
  type PitchData,
} from '@/lib/generation/documents';
import { generateVisualBrief, maybeGenerateImages } from '@/lib/generation/visuals';

// Max execution time for this cron job (Vercel has 10 second limit on Hobby tier)
const MAX_EXECUTION_TIME = 8000; // 8 seconds to leave buffer
const CRON_SECRET = process.env.CRON_SECRET;

type ProcessingStep = 'extract_text' | 'generate_summary' | 'create_action_items' | 'finalize';

function log(event: string, payload: Record<string, unknown>) {
  console.log(
    JSON.stringify({
      scope: 'job_processor',
      event,
      ts: new Date().toISOString(),
      ...payload,
    })
  );
}

interface JobData {
  job_id: string;
  ingestion_id: string;
  step: ProcessingStep;
  payload: Record<string, unknown>;
}

// Extract text from uploaded file and store metadata
async function processTextExtraction(supabase: ReturnType<typeof getAdminClient>, jobData: JobData): Promise<Record<string, unknown>> {
  const { ingestion_id } = jobData;

  log('text_extraction_start', { ingestion_id, job_id: jobData.job_id });

  // Get ingestion data
  const { data: ingestion, error: ingestionError } = await supabase
    .from('ingestions')
    .select('*')
    .eq('id', ingestion_id)
    .single();

  if (ingestionError || !ingestion) {
    throw new Error(`Ingestion not found: ${ingestionError?.message}`);
  }

  // Download file from storage
  const { data: fileResponse, error: downloadError } = await supabase.storage
    .from('scripts')
    .download(ingestion.source_file_url);

  if (downloadError || !fileResponse) {
    throw new Error(`File download failed: ${downloadError?.message || 'No file response'}`);
  }

  const arrayBuffer = await fileResponse.arrayBuffer();
  const scriptBuffer = Buffer.from(arrayBuffer);

  // Process file using existing ingestion core
  const result = await ingestFile(
    ingestion.source_file_url.split('/').pop() || 'script',
    scriptBuffer,
    ingestion.mime_type || undefined,
    { extractMetadata: true }
  );

  const extractedData = {
    textContent: result.content?.textContent || '',
    metadata: result.content?.metadata || {},
    contentType: result.content?.contentType || 'unknown',
    extractedAt: new Date().toISOString(),
  };

  log('text_extraction_complete', {
    ingestion_id,
    job_id: jobData.job_id,
    text_length: extractedData.textContent.length
  });

  return extractedData;
}

// Generate AI-powered summary and core elements
async function generateSummary(supabase: ReturnType<typeof getAdminClient>, jobData: JobData): Promise<Record<string, unknown>> {
  const { ingestion_id } = jobData;

  log('summary_generation_start', { ingestion_id, job_id: jobData.job_id });

  // Get extracted text from previous step
  const { data: prevJob, error: prevJobError } = await supabase
    .from('processing_jobs')
    .select('result')
    .eq('ingestion_id', ingestion_id)
    .eq('step', 'extract_text')
    .eq('status', 'succeeded')
    .single();

  if (prevJobError || !prevJob?.result) {
    throw new Error(`Previous extraction step not found or failed: ${prevJobError?.message}`);
  }

  const extractedData = prevJob.result as any;
  const scriptText = extractedData.textContent || '';

  if (!scriptText) {
    throw new Error('No text content available for summary generation');
  }

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
      // Fallback when no API key
      coreResult = {
        logline: extractedData.metadata?.title || 'Untitled project logline pending',
        synopsis: scriptText.slice(0, 1200),
        themes: ['identity', 'family'],
        characters: [],
      };
    }
  } catch (error) {
    log('ai_generation_error', {
      ingestion_id,
      job_id: jobData.job_id,
      err: error instanceof Error ? error.message : String(error)
    });

    // Use fallback
    coreResult = {
      logline: extractedData.metadata?.title || 'Untitled project logline pending',
      synopsis: scriptText.slice(0, 1200),
      themes: ['identity', 'family'],
      characters: [],
      fallbackUsed: true,
    };
  }

  log('summary_generation_complete', {
    ingestion_id,
    job_id: jobData.job_id,
    has_logline: Boolean(coreResult.logline),
    has_synopsis: Boolean(coreResult.synopsis)
  });

  return coreResult;
}

// Create actionable insights and character development
async function createActionItems(supabase: ReturnType<typeof getAdminClient>, jobData: JobData): Promise<Record<string, unknown>> {
  const { ingestion_id } = jobData;

  log('action_items_start', { ingestion_id, job_id: jobData.job_id });

  // Get summary from previous step
  const { data: prevJob, error: prevJobError } = await supabase
    .from('processing_jobs')
    .select('result')
    .eq('ingestion_id', ingestion_id)
    .eq('step', 'generate_summary')
    .eq('status', 'succeeded')
    .single();

  if (prevJobError || !prevJob?.result) {
    throw new Error(`Previous summary step not found or failed: ${prevJobError?.message}`);
  }

  const coreResult = prevJob.result as any;

  let bible: Record<string, unknown> = {};
  let visualsOutput: Record<string, unknown> = {};
  let marketAdaptation: Record<string, unknown> = {};

  try {
    // Generate character bible
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

    // Generate visual concepts
    visualsOutput = await generateVisualBrief(coreResult as any);
    visualsOutput.images = await maybeGenerateImages([]);

    // Market adaptation (placeholder)
    marketAdaptation = {
      recommendations: [
        { platform: 'Netflix', rationale: 'Strong family drama slate needs fresh voices' },
        { platform: 'Amazon', rationale: 'Action beat resonates with current India Originals push' },
      ],
    };

  } catch (error) {
    log('action_items_error', {
      ingestion_id,
      job_id: jobData.job_id,
      err: error instanceof Error ? error.message : String(error)
    });

    // Use fallbacks
    bible = {
      characters: [
        {
          name: 'Protagonist',
          motivations: ['prove self'],
          conflicts: ['family pressure'],
          arc: 'from doubt to purpose',
        },
      ],
      fallbackUsed: true,
    };

    visualsOutput = { concepts: [], fallbackUsed: true };

    marketAdaptation = {
      recommendations: [
        { platform: 'Netflix', rationale: 'Strong family drama slate needs fresh voices' },
      ],
      fallbackUsed: true,
    };
  }

  const actionItems = {
    characterBible: bible,
    visualConcepts: visualsOutput,
    marketRecommendations: marketAdaptation,
    generatedAt: new Date().toISOString(),
  };

  log('action_items_complete', {
    ingestion_id,
    job_id: jobData.job_id,
    character_count: bible.characters ? (bible.characters as any[]).length : 0
  });

  return actionItems;
}

// Finalize processing with document generation
async function finalizeProcessing(supabase: ReturnType<typeof getAdminClient>, jobData: JobData): Promise<Record<string, unknown>> {
  const { ingestion_id } = jobData;

  log('finalization_start', { ingestion_id, job_id: jobData.job_id });

  // Get ingestion data
  const { data: ingestion, error: ingestionError } = await supabase
    .from('ingestions')
    .select('*')
    .eq('id', ingestion_id)
    .single();

  if (ingestionError || !ingestion) {
    throw new Error(`Ingestion not found: ${ingestionError?.message}`);
  }

  // Get all previous job results
  const { data: allJobs, error: jobsError } = await supabase
    .from('processing_jobs')
    .select('step, result')
    .eq('ingestion_id', ingestion_id)
    .eq('status', 'succeeded')
    .in('step', ['extract_text', 'generate_summary', 'create_action_items']);

  if (jobsError || !allJobs || allJobs.length < 3) {
    throw new Error(`Previous processing steps incomplete: ${jobsError?.message}`);
  }

  const jobResults = allJobs.reduce((acc, job) => {
    acc[job.step] = job.result;
    return acc;
  }, {} as Record<string, any>);

  const extractedData = jobResults.extract_text;
  const coreResult = jobResults.generate_summary;
  const actionItems = jobResults.create_action_items;

  try {
    // Prepare pitch data
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
      characters: (actionItems.characterBible?.characters as any) || [],
      marketTags: (actionItems.marketRecommendations?.recommendations || []).map((r: any) => r.platform),
    };

    // Generate documents
    const baseDir = `generated-assets/${ingestion.user_id}/${ingestion_id}`;
    const [pdfBuffer, pptxBuffer, docxBuffer] = await Promise.all([
      generatePitchPDF(pitchData),
      generatePitchPPTX(pitchData),
      generateSummaryDOCX(pitchData),
    ]);

    // Upload to storage
    await Promise.all([
      supabase.storage
        .from('generated-assets')
        .upload(`${baseDir}/pitch.pdf`, pdfBuffer, {
          contentType: 'application/pdf',
          upsert: true,
        }),
      supabase.storage
        .from('generated-assets')
        .upload(`${baseDir}/pitch.pptx`, pptxBuffer, {
          contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          upsert: true,
        }),
      supabase.storage
        .from('generated-assets')
        .upload(`${baseDir}/summary.docx`, docxBuffer, {
          contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          upsert: true,
        }),
    ]);

    const assets = {
      pdf: `${baseDir}/pitch.pdf`,
      pptx: `${baseDir}/pitch.pptx`,
      docx: `${baseDir}/summary.docx`,
    };

    // Update ingestion to completed
    await supabase
      .from('ingestions')
      .update({
        status: 'completed',
        progress: 100,
        error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', ingestion_id);

    log('finalization_complete', {
      ingestion_id,
      job_id: jobData.job_id,
      assets_created: Object.keys(assets).length
    });

    return {
      ready: true,
      assets,
      completedAt: new Date().toISOString(),
    };

  } catch (error) {
    log('document_generation_error', {
      ingestion_id,
      job_id: jobData.job_id,
      err: error instanceof Error ? error.message : String(error)
    });

    // Still mark as completed but with error info
    await supabase
      .from('ingestions')
      .update({
        status: 'completed',
        progress: 100,
        error: `Document generation failed: ${error instanceof Error ? error.message : String(error)}`,
        updated_at: new Date().toISOString(),
      })
      .eq('id', ingestion_id);

    return {
      ready: true,
      error: error instanceof Error ? error.message : String(error),
      completedAt: new Date().toISOString(),
    };
  }
}

// Main job processing function
async function processJob(supabase: ReturnType<typeof getAdminClient>, jobData: JobData): Promise<Record<string, unknown>> {
  switch (jobData.step) {
    case 'extract_text':
      return await processTextExtraction(supabase, jobData);
    case 'generate_summary':
      return await generateSummary(supabase, jobData);
    case 'create_action_items':
      return await createActionItems(supabase, jobData);
    case 'finalize':
      return await finalizeProcessing(supabase, jobData);
    default:
      throw new Error(`Unknown processing step: ${jobData.step}`);
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const userAgent = request.headers.get('user-agent') || 'unknown';

  log('cron_processor_start', {
    user_agent: userAgent,
    has_cron_secret: Boolean(CRON_SECRET),
  });

  // Verify cron authorization
  if (!CRON_SECRET) {
    log('config_error', { has_secret: false });
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }

  const headerSecret =
    request.headers.get('x-cron-secret') ||
    request.headers.get('authorization')?.replace('Bearer ', '') ||
    '';

  if (headerSecret !== CRON_SECRET) {
    log('cron_auth_failed', {
      provided: Boolean(headerSecret),
      user_agent: userAgent,
    });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdminClient();
  let processedJobs = 0;

  try {
    // Process jobs until we run out of time or jobs
    while (Date.now() - startTime < MAX_EXECUTION_TIME) {
      // Get next available job
      const { data: jobData, error: jobError } = await supabase.rpc('get_next_processing_job');

      if (jobError) {
        log('job_fetch_error', { err: jobError.message });
        break;
      }

      if (!jobData || jobData.length === 0) {
        log('no_jobs_available', { processed_count: processedJobs });
        break;
      }

      const job = jobData[0] as JobData;

      log('processing_job_start', {
        job_id: job.job_id,
        ingestion_id: job.ingestion_id,
        step: job.step,
      });

      try {
        // Process the job
        const result = await processJob(supabase, job);

        // Mark job as succeeded
        await supabase.rpc('update_processing_job_status', {
          p_job_id: job.job_id,
          p_status: 'succeeded',
          p_result: result,
          p_error_message: null,
        });

        // Update ingestion progress
        const stepProgress = {
          extract_text: 25,
          generate_summary: 50,
          create_action_items: 75,
          finalize: 100,
        };

        await supabase
          .from('ingestions')
          .update({
            progress: stepProgress[job.step],
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.ingestion_id);

        log('job_succeeded', {
          job_id: job.job_id,
          ingestion_id: job.ingestion_id,
          step: job.step,
          progress: stepProgress[job.step],
        });

        processedJobs++;

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        log('job_failed', {
          job_id: job.job_id,
          ingestion_id: job.ingestion_id,
          step: job.step,
          err: errorMessage,
        });

        // Update job as failed or retrying
        await supabase.rpc('update_processing_job_status', {
          p_job_id: job.job_id,
          p_status: 'retrying',
          p_result: null,
          p_error_message: errorMessage,
        });

        // Mark ingestion as failed if max retries exceeded
        const { data: retriedJob } = await supabase
          .from('processing_jobs')
          .select('retry_count')
          .eq('id', job.job_id)
          .single();

        if (retriedJob && retriedJob.retry_count >= 3) {
          await supabase
            .from('ingestions')
            .update({
              status: 'failed',
              error: `Step '${job.step}' failed after 3 retries: ${errorMessage}`,
              updated_at: new Date().toISOString(),
            })
            .eq('id', job.ingestion_id);

          log('ingestion_failed_max_retries', {
            ingestion_id: job.ingestion_id,
            step: job.step,
            retry_count: retriedJob.retry_count,
          });
        }
      }
    }

    const totalDuration = Date.now() - startTime;

    log('cron_processor_complete', {
      processed_jobs: processedJobs,
      total_duration: totalDuration,
      time_limit_reached: totalDuration >= MAX_EXECUTION_TIME,
    });

    return NextResponse.json({
      ok: true,
      processedJobs,
      duration: totalDuration,
      message: `Processed ${processedJobs} jobs successfully`,
    });

  } catch (error) {
    const totalDuration = Date.now() - startTime;
    const message = error instanceof Error ? error.message : 'Unknown processor error';

    log('cron_processor_failed', {
      err: message,
      processed_jobs: processedJobs,
      total_duration: totalDuration,
    });

    return NextResponse.json({
      error: message,
      processedJobs,
      duration: totalDuration
    }, { status: 500 });
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