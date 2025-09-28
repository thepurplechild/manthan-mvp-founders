// Founder-only manual step trigger endpoint for human-in-the-loop ingestion pipeline
// Allows founders to manually approve and trigger each AI processing step after reviewing the previous step's output

import { NextRequest, NextResponse } from 'next/server';
import { getRlsServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import {
  stepExtractElements,
  stepGenerateCharacters,
  stepMarketAdaptation,
  stepPitchContent,
  stepVisualConcepts
} from '@/lib/ai/steps';

// Step sequence with dependencies
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

// AI processing steps that require function execution
const AI_STEP_NAMES = [
  'core_extraction',
  'character_bible',
  'visuals',
  'market_adaptation',
  'package_assembly'
] as const;

type AIStepName = (typeof AI_STEP_NAMES)[number];

interface TriggerStepRequest {
  projectId: string;
  stepName: StepName;
}

function log(event: string, payload: Record<string, unknown>) {
  console.log(
    JSON.stringify({
      scope: 'founder_step_trigger',
      event,
      ts: new Date().toISOString(),
      ...payload,
    })
  );
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

async function getPreviousStepOutput(
  supabase: ReturnType<typeof getAdminClient>,
  ingestionId: string,
  currentStepIndex: number
): Promise<any> {
  if (currentStepIndex === 0) {
    return null; // No previous step for first step
  }

  const previousStepName = STEP_SEQUENCE[currentStepIndex - 1];

  const { data: previousStep, error } = await supabase
    .from('ingestion_steps')
    .select('output, status')
    .eq('ingestion_id', ingestionId)
    .eq('name', previousStepName)
    .single();

  if (error || !previousStep) {
    throw new Error(`Previous step ${previousStepName} not found or accessible`);
  }

  if (previousStep.status !== 'succeeded') {
    throw new Error(`Previous step ${previousStepName} has not succeeded (status: ${previousStep.status})`);
  }

  return previousStep.output;
}

function getNextStepName(currentStepName: StepName): StepName | null {
  const currentIndex = STEP_SEQUENCE.indexOf(currentStepName);
  if (currentIndex === -1 || currentIndex === STEP_SEQUENCE.length - 1) {
    return null;
  }
  return STEP_SEQUENCE[currentIndex + 1];
}

async function executeAIStep(stepName: AIStepName, input: any): Promise<any> {
  switch (stepName) {
    case 'core_extraction':
      // Input should be the preprocessed text content
      return await stepExtractElements(input.textContent || input);

    case 'character_bible':
      // Input should be the core elements from previous step
      return await stepGenerateCharacters(input.core || input);

    case 'visuals':
      // Requires both core elements and characters
      if (!input.core || !input.characters) {
        throw new Error('Visual concepts step requires both core elements and character data');
      }
      return await stepVisualConcepts(input.core, input.characters);

    case 'market_adaptation':
      // Requires core, characters, and optional overrides
      if (!input.core || !input.characters) {
        throw new Error('Market adaptation step requires both core elements and character data');
      }
      return await stepMarketAdaptation(input.core, input.characters, input.overrides);

    case 'package_assembly':
      // Requires core, market adaptation, and characters
      if (!input.core || !input.market || !input.characters) {
        throw new Error('Package assembly step requires core, market, and character data');
      }
      return await stepPitchContent(input.core, input.market, input.characters);

    default:
      throw new Error(`Unknown AI step: ${stepName}`);
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Parse request body
    const body: TriggerStepRequest = await request.json();
    const { projectId, stepName } = body;

    if (!projectId || !stepName) {
      return NextResponse.json({
        error: 'Missing required fields: projectId and stepName'
      }, { status: 400 });
    }

    if (!STEP_SEQUENCE.includes(stepName)) {
      return NextResponse.json({
        error: `Invalid step name. Must be one of: ${STEP_SEQUENCE.join(', ')}`
      }, { status: 400 });
    }

    log('step_trigger_request', {
      project_id: projectId,
      step_name: stepName,
    });

    // Authenticate and authorize founder
    const supabase = await getRlsServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Verify founder role
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile || profile.role !== 'founder') {
      log('authorization_failed', {
        user_id: user.id,
        role: profile?.role,
        project_id: projectId
      });
      return NextResponse.json({ error: 'Founder access required' }, { status: 403 });
    }

    // Verify project access and get ingestion
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, owner_id')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Get ingestion for this project
    const adminSupabase = getAdminClient();
    const { data: ingestion, error: ingestionError } = await adminSupabase
      .from('ingestions')
      .select('id, status, progress')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (ingestionError || !ingestion) {
      return NextResponse.json({ error: 'No ingestion found for this project' }, { status: 404 });
    }

    const ingestionId = ingestion.id;

    log('ingestion_found', {
      ingestion_id: ingestionId,
      project_id: projectId,
      current_status: ingestion.status,
      step_requested: stepName
    });

    // Get current step and validate it can be triggered
    const { data: currentStep, error: stepError } = await adminSupabase
      .from('ingestion_steps')
      .select('status, started_at, finished_at, error')
      .eq('ingestion_id', ingestionId)
      .eq('name', stepName)
      .single();

    if (stepError || !currentStep) {
      return NextResponse.json({
        error: `Step ${stepName} not found for this ingestion`
      }, { status: 404 });
    }

    // Check if step can be triggered
    if (currentStep.status === 'succeeded') {
      return NextResponse.json({
        error: `Step ${stepName} has already been completed successfully`
      }, { status: 400 });
    }

    if (currentStep.status === 'running') {
      return NextResponse.json({
        error: `Step ${stepName} is currently running`
      }, { status: 400 });
    }

    // Validate that previous step has succeeded (except for first step)
    const currentStepIndex = STEP_SEQUENCE.indexOf(stepName);
    if (currentStepIndex > 0) {
      const previousStepName = STEP_SEQUENCE[currentStepIndex - 1];
      const { data: previousStep } = await adminSupabase
        .from('ingestion_steps')
        .select('status')
        .eq('ingestion_id', ingestionId)
        .eq('name', previousStepName)
        .single();

      if (!previousStep || previousStep.status !== 'succeeded') {
        return NextResponse.json({
          error: `Previous step ${previousStepName} must be completed before triggering ${stepName}`
        }, { status: 400 });
      }
    }

    // If this is not an AI step, just mark it as triggered/succeeded
    if (!AI_STEP_NAMES.includes(stepName as AIStepName)) {
      await updateStep(adminSupabase, ingestionId, stepName, {
        status: 'succeeded',
        started_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
        output: {
          triggeredBy: user.id,
          triggeredAt: new Date().toISOString(),
          note: 'Manual step completion'
        }
      });

      const nextStep = getNextStepName(stepName);
      const isComplete = !nextStep;

      // Update ingestion status
      await adminSupabase
        .from('ingestions')
        .update({
          status: isComplete ? 'completed' : 'pending_review',
          progress: Math.min(100, ((currentStepIndex + 1) / STEP_SEQUENCE.length) * 100),
          updated_at: new Date().toISOString(),
        })
        .eq('id', ingestionId);

      return NextResponse.json({
        ok: true,
        message: `Step ${stepName} completed successfully`,
        nextStep,
        isComplete,
        duration: Date.now() - startTime
      });
    }

    // Execute AI step
    await updateStep(adminSupabase, ingestionId, stepName, {
      status: 'running',
      started_at: new Date().toISOString(),
    });

    log('ai_step_execution_start', {
      ingestion_id: ingestionId,
      step_name: stepName
    });

    // Get input data for the AI step
    let stepInput: any;

    if (stepName === 'core_extraction') {
      // Get text content from preprocessing step
      const preprocessOutput = await getPreviousStepOutput(adminSupabase, ingestionId, currentStepIndex);
      stepInput = preprocessOutput.textContent;
    } else {
      // For other steps, collect required outputs from previous steps
      const stepOutputs: any = {};

      for (let i = 0; i < currentStepIndex; i++) {
        const prevStepName = STEP_SEQUENCE[i];
        const output = await getPreviousStepOutput(adminSupabase, ingestionId, i + 1);

        // Map step outputs to expected input names
        switch (prevStepName) {
          case 'script_preprocess':
            stepOutputs.textContent = output.textContent;
            break;
          case 'core_extraction':
            stepOutputs.core = output;
            break;
          case 'character_bible':
            stepOutputs.characters = output;
            break;
          case 'visuals':
            stepOutputs.visuals = output;
            break;
          case 'market_adaptation':
            stepOutputs.market = output;
            break;
        }
      }

      stepInput = stepOutputs;
    }

    // Execute the AI step
    const stepOutput = await executeAIStep(stepName as AIStepName, stepInput);

    // Save successful result
    await updateStep(adminSupabase, ingestionId, stepName, {
      status: 'succeeded',
      finished_at: new Date().toISOString(),
      output: {
        ...stepOutput,
        executedBy: user.id,
        executedAt: new Date().toISOString(),
      }
    });

    // Update ingestion progress
    const nextStep = getNextStepName(stepName);
    const isComplete = !nextStep;
    const newProgress = Math.min(100, Math.round(((currentStepIndex + 1) / STEP_SEQUENCE.length) * 100));

    await adminSupabase
      .from('ingestions')
      .update({
        status: isComplete ? 'completed' : 'pending_review',
        progress: newProgress,
        updated_at: new Date().toISOString(),
      })
      .eq('id', ingestionId);

    const duration = Date.now() - startTime;

    log('step_execution_complete', {
      ingestion_id: ingestionId,
      step_name: stepName,
      duration,
      next_step: nextStep,
      is_complete: isComplete
    });

    return NextResponse.json({
      ok: true,
      message: `Step ${stepName} executed successfully`,
      stepOutput,
      nextStep,
      isComplete,
      progress: newProgress,
      duration
    });

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown step execution error';
    const duration = Date.now() - startTime;

    log('step_execution_failed', {
      err: message,
      stack: error instanceof Error ? error.stack : undefined,
      duration,
    });

    return NextResponse.json({
      error: `Step execution failed: ${message}`
    }, { status: 500 });
  }
}