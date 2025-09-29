// Founder-only manual pipeline step trigger endpoint for human-in-the-loop workflow
// Allows founders to manually approve and trigger each AI processing step after reviewing the previous step's output
// Authentication: Requires founder role verification
// Usage: POST with { ingestionId, stepName } to trigger the next step in the pipeline

import { NextRequest, NextResponse } from 'next/server';
import { getRlsServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import {
  stepGenerateCharacters,
  stepMarketAdaptation,
  stepPitchContent,
  stepVisualConcepts
} from '@/lib/ai/steps';

// Complete step sequence for the human-in-the-loop pipeline
const STEP_SEQUENCE = [
  'script_preprocess',   // Step 1: File parsing (automated)
  'core_extraction',     // Step 2: Core elements (automated)
  'character_bible',     // Step 3: Characters (founder approval required)
  'visuals',            // Step 4: Visual concepts (founder approval required)
  'market_adaptation',   // Step 5: Market adaptation (founder approval required)
  'package_assembly',    // Step 6: Pitch content assembly (founder approval required)
  'final_package'       // Step 7: Final package (founder approval required)
] as const;

type StepName = (typeof STEP_SEQUENCE)[number];

// Step configuration mapping AI functions to step names
const STEP_CONFIG = {
  character_bible: {
    function: stepGenerateCharacters,
    dependsOn: 'core_extraction',
    order: 3,
    requiresFounderApproval: true
  },
  visuals: {
    function: stepVisualConcepts,
    dependsOn: 'character_bible',
    order: 4,
    requiresFounderApproval: true
  },
  market_adaptation: {
    function: stepMarketAdaptation,
    dependsOn: 'visuals',
    order: 5,
    requiresFounderApproval: true
  },
  package_assembly: {
    function: stepPitchContent,
    dependsOn: 'market_adaptation',
    order: 6,
    requiresFounderApproval: true
  },
  final_package: {
    function: null, // Manual completion step
    dependsOn: 'package_assembly',
    order: 7,
    requiresFounderApproval: true
  }
} as const;

type TriggerableStepName = keyof typeof STEP_CONFIG;

interface TriggerStepRequest {
  ingestionId: string;
  stepName: TriggerableStepName;
}

interface TriggerStepResponse {
  message: string;
  stepName: string;
  status: 'succeeded';
  output: any;
  nextStep: string | null;
}

function log(event: string, payload: Record<string, unknown>) {
  console.log(
    JSON.stringify({
      scope: 'founder_pipeline_trigger',
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

async function getStepOutput(
  supabase: ReturnType<typeof getAdminClient>,
  ingestionId: string,
  stepName: StepName
): Promise<any> {
  const { data: step, error } = await supabase
    .from('ingestion_steps')
    .select('output, status')
    .eq('ingestion_id', ingestionId)
    .eq('name', stepName)
    .single();

  if (error || !step) {
    throw new Error(`Step ${stepName} not found`);
  }

  if (step.status !== 'succeeded') {
    throw new Error(`Step ${stepName} has not succeeded (status: ${step.status})`);
  }

  return step.output;
}

async function collectStepInputs(
  supabase: ReturnType<typeof getAdminClient>,
  ingestionId: string,
  stepName: TriggerableStepName
): Promise<any> {
  switch (stepName) {
    case 'character_bible':
      // Requires core elements from step 2
      return await getStepOutput(supabase, ingestionId, 'core_extraction');

    case 'visuals':
      // Requires both core elements and characters
      const [coreElements, characters] = await Promise.all([
        getStepOutput(supabase, ingestionId, 'core_extraction'),
        getStepOutput(supabase, ingestionId, 'character_bible')
      ]);
      return { core: coreElements, characters };

    case 'market_adaptation':
      // Requires core, characters, and optional overrides
      const [core, chars] = await Promise.all([
        getStepOutput(supabase, ingestionId, 'core_extraction'),
        getStepOutput(supabase, ingestionId, 'character_bible')
      ]);
      return { core, characters: chars, overrides: undefined };

    case 'package_assembly':
      // Requires core, market adaptation, and characters
      const [coreData, marketData, charData] = await Promise.all([
        getStepOutput(supabase, ingestionId, 'core_extraction'),
        getStepOutput(supabase, ingestionId, 'market_adaptation'),
        getStepOutput(supabase, ingestionId, 'character_bible')
      ]);
      return { core: coreData, market: marketData, characters: charData };

    case 'final_package':
      // Manual completion - no AI execution required
      return null;

    default:
      throw new Error(`Unknown step: ${stepName}`);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse<TriggerStepResponse | { error: string }>> {
  const startTime = Date.now();

  try {
    // Parse and validate request body
    const body: TriggerStepRequest = await request.json();
    const { ingestionId, stepName } = body;

    if (!ingestionId || !stepName) {
      return NextResponse.json({
        error: 'Missing required fields: ingestionId and stepName'
      }, { status: 400 });
    }

    if (!(stepName in STEP_CONFIG)) {
      return NextResponse.json({
        error: `Invalid step name. Must be one of: ${Object.keys(STEP_CONFIG).join(', ')}`
      }, { status: 400 });
    }

    log('pipeline_step_trigger_request', {
      ingestion_id: ingestionId,
      step_name: stepName,
    });

    // Authentication & Authorization: Verify founder role
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
      log('founder_authorization_failed', {
        user_id: user.id,
        role: profile?.role,
        ingestion_id: ingestionId
      });
      return NextResponse.json({ error: 'Founder access required' }, { status: 403 });
    }

    log('founder_authorization_success', {
      user_id: user.id,
      ingestion_id: ingestionId,
      step_name: stepName
    });

    // Validation: Verify ingestion exists and is in correct state
    const adminSupabase = getAdminClient();
    const { data: ingestion, error: ingestionError } = await adminSupabase
      .from('ingestions')
      .select('id, status, progress, project_id')
      .eq('id', ingestionId)
      .single();

    if (ingestionError || !ingestion) {
      return NextResponse.json({ error: 'Ingestion not found' }, { status: 404 });
    }

    if (ingestion.status !== 'pending_review') {
      return NextResponse.json({
        error: `Ingestion must be in pending_review status to trigger steps (current: ${ingestion.status})`
      }, { status: 400 });
    }

    // Dependency Check: Verify previous step has succeeded
    const stepConfig = STEP_CONFIG[stepName];
    const { data: previousStep } = await adminSupabase
      .from('ingestion_steps')
      .select('status')
      .eq('ingestion_id', ingestionId)
      .eq('name', stepConfig.dependsOn)
      .single();

    if (!previousStep || previousStep.status !== 'succeeded') {
      return NextResponse.json({
        error: `Previous step ${stepConfig.dependsOn} must be completed before triggering ${stepName}`
      }, { status: 400 });
    }

    // Check if current step can be triggered
    const { data: currentStep, error: stepError } = await adminSupabase
      .from('ingestion_steps')
      .select('status')
      .eq('ingestion_id', ingestionId)
      .eq('name', stepName)
      .single();

    if (stepError || !currentStep) {
      return NextResponse.json({
        error: `Step ${stepName} not found for this ingestion`
      }, { status: 404 });
    }

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

    // Step Execution: Update status to running
    await updateStep(adminSupabase, ingestionId, stepName, {
      status: 'running',
      started_at: new Date().toISOString(),
    });

    // Update ingestion status to processing
    await adminSupabase
      .from('ingestions')
      .update({
        status: 'processing',
        updated_at: new Date().toISOString(),
      })
      .eq('id', ingestionId);

    log('ai_step_execution_start', {
      ingestion_id: ingestionId,
      step_name: stepName,
      depends_on: stepConfig.dependsOn
    });

    let stepOutput: any;

    if (stepName === 'final_package') {
      // Manual completion step - no AI execution
      stepOutput = {
        completedBy: user.id,
        completedAt: new Date().toISOString(),
        note: 'Final package assembly completed by founder',
        pipelineCompleted: true
      };
    } else {
      // Execute AI step
      const stepInput = await collectStepInputs(adminSupabase, ingestionId, stepName);
      const aiFunction = stepConfig.function;

      if (!aiFunction) {
        throw new Error(`No AI function configured for step ${stepName}`);
      }

      // Execute the appropriate AI function based on step requirements
      if (stepName === 'character_bible') {
        stepOutput = await stepGenerateCharacters(stepInput);
      } else if (stepName === 'visuals') {
        stepOutput = await stepVisualConcepts(stepInput.core, stepInput.characters);
      } else if (stepName === 'market_adaptation') {
        stepOutput = await stepMarketAdaptation(stepInput.core, stepInput.characters, stepInput.overrides);
      } else if (stepName === 'package_assembly') {
        stepOutput = await stepPitchContent(stepInput.core, stepInput.market, stepInput.characters);
      }
    }

    // State Update After Execution: Save successful result
    await updateStep(adminSupabase, ingestionId, stepName, {
      status: 'succeeded',
      finished_at: new Date().toISOString(),
      output: {
        ...stepOutput,
        executedBy: user.id,
        executedAt: new Date().toISOString(),
      }
    });

    // Determine next step and final status
    const currentStepIndex = STEP_SEQUENCE.indexOf(stepName);
    const nextStepName = currentStepIndex < STEP_SEQUENCE.length - 1
      ? STEP_SEQUENCE[currentStepIndex + 1]
      : null;
    const isComplete = !nextStepName;

    const newProgress = Math.min(100, Math.round(((currentStepIndex + 1) / STEP_SEQUENCE.length) * 100));

    // Update ingestion final status
    await adminSupabase
      .from('ingestions')
      .update({
        status: isComplete ? 'completed' : 'pending_review',
        progress: newProgress,
        updated_at: new Date().toISOString(),
      })
      .eq('id', ingestionId);

    const duration = Date.now() - startTime;

    log('pipeline_step_execution_complete', {
      ingestion_id: ingestionId,
      step_name: stepName,
      duration,
      next_step: nextStepName,
      is_complete: isComplete,
      progress: newProgress
    });

    return NextResponse.json({
      message: `Step ${stepName} executed successfully`,
      stepName,
      status: 'succeeded' as const,
      output: stepOutput,
      nextStep: nextStepName
    });

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown step execution error';
    const duration = Date.now() - startTime;

    log('pipeline_step_execution_failed', {
      err: message,
      stack: error instanceof Error ? error.stack : undefined,
      duration,
    });

    return NextResponse.json({
      error: `Step execution failed: ${message}`
    }, { status: 500 });
  }
}