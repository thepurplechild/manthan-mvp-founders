// Real-time progress tracking endpoint for ingestion processing
// Returns detailed status with step-by-step breakdown and error information

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Processing steps in order
const PROCESSING_STEPS = [
  'extract_text',
  'generate_summary',
  'create_action_items',
  'finalize'
] as const;

type ProcessingStep = (typeof PROCESSING_STEPS)[number];

interface JobStatus {
  step: ProcessingStep;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'retrying';
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  retry_count: number;
}

interface ProgressResponse {
  ingestionId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  error?: string;
  steps: JobStatus[];
  currentStep?: ProcessingStep;
  estimatedTimeRemaining?: number;
  createdAt: string;
  updatedAt: string;
}

function calculateProgress(jobs: JobStatus[]): number {
  const totalSteps = PROCESSING_STEPS.length;
  const completedSteps = jobs.filter(job => job.status === 'succeeded').length;
  return Math.round((completedSteps / totalSteps) * 100);
}

function getCurrentStep(jobs: JobStatus[]): ProcessingStep | undefined {
  // Find the first step that's not completed
  for (const stepName of PROCESSING_STEPS) {
    const job = jobs.find(j => j.step === stepName);
    if (!job || job.status !== 'succeeded') {
      return stepName;
    }
  }
  return undefined; // All steps completed
}

function estimateTimeRemaining(jobs: JobStatus[], ingestionCreatedAt: string): number | undefined {
  const now = new Date();
  const createdAt = new Date(ingestionCreatedAt);
  const elapsedMs = now.getTime() - createdAt.getTime();

  const completedJobs = jobs.filter(job => job.status === 'succeeded');
  const totalJobs = PROCESSING_STEPS.length;

  if (completedJobs.length === 0) {
    // No steps completed yet, estimate 3-5 minutes total
    return 4 * 60 * 1000; // 4 minutes in milliseconds
  }

  if (completedJobs.length === totalJobs) {
    return 0; // All done
  }

  // Calculate average time per completed step
  const avgTimePerStep = elapsedMs / completedJobs.length;
  const remainingSteps = totalJobs - completedJobs.length;

  return Math.round(avgTimePerStep * remainingSteps);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: ingestionId } = await params;

  if (!ingestionId) {
    return NextResponse.json({ error: 'Missing ingestion ID' }, { status: 400 });
  }

  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookies) {
            cookies.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          },
        },
      }
    );

    // Get ingestion details
    const { data: ingestion, error: ingestionError } = await supabase
      .from('ingestions')
      .select('id, status, progress, error, created_at, updated_at, user_id')
      .eq('id', ingestionId)
      .single();

    if (ingestionError || !ingestion) {
      return NextResponse.json(
        { error: 'Ingestion not found' },
        { status: 404 }
      );
    }

    // Verify user ownership
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || user.id !== ingestion.user_id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    // Get processing jobs for this ingestion
    const { data: jobs, error: jobsError } = await supabase
      .from('processing_jobs')
      .select('step, status, started_at, completed_at, error_message, retry_count')
      .eq('ingestion_id', ingestionId)
      .order('created_at', { ascending: true });

    if (jobsError) {
      return NextResponse.json(
        { error: 'Failed to fetch job status' },
        { status: 500 }
      );
    }

    // Transform jobs data
    const jobStatuses: JobStatus[] = PROCESSING_STEPS.map(stepName => {
      const job = jobs?.find(j => j.step === stepName);
      return {
        step: stepName,
        status: job?.status || 'queued',
        started_at: job?.started_at || null,
        completed_at: job?.completed_at || null,
        error_message: job?.error_message || null,
        retry_count: job?.retry_count || 0,
      };
    });

    // Calculate derived values
    const progress = calculateProgress(jobStatuses);
    const currentStep = getCurrentStep(jobStatuses);
    const estimatedTimeRemaining = estimateTimeRemaining(jobStatuses, ingestion.created_at);

    const response: ProgressResponse = {
      ingestionId: ingestion.id,
      status: ingestion.status,
      progress: Math.max(progress, ingestion.progress), // Use the higher of calculated vs stored progress
      error: ingestion.error || undefined,
      steps: jobStatuses,
      currentStep,
      estimatedTimeRemaining,
      createdAt: ingestion.created_at,
      updatedAt: ingestion.updated_at,
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('Status endpoint error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PATCH method to retry failed jobs
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: ingestionId } = await params;

  if (!ingestionId) {
    return NextResponse.json({ error: 'Missing ingestion ID' }, { status: 400 });
  }

  try {
    const body = await request.json();
    const { action } = body;

    if (action !== 'retry') {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookies) {
            cookies.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          },
        },
      }
    );

    // Verify user ownership
    const { data: ingestion, error: ingestionError } = await supabase
      .from('ingestions')
      .select('id, user_id, status')
      .eq('id', ingestionId)
      .single();

    if (ingestionError || !ingestion) {
      return NextResponse.json({ error: 'Ingestion not found' }, { status: 404 });
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user || user.id !== ingestion.user_id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Only allow retry for failed ingestions
    if (ingestion.status !== 'failed') {
      return NextResponse.json(
        { error: 'Can only retry failed ingestions' },
        { status: 400 }
      );
    }

    // Reset failed jobs to queued status
    const { error: resetError } = await supabase
      .from('processing_jobs')
      .update({
        status: 'queued',
        error_message: null,
        retry_count: 0,
        started_at: null,
        completed_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('ingestion_id', ingestionId)
      .eq('status', 'failed');

    if (resetError) {
      return NextResponse.json(
        { error: 'Failed to reset jobs' },
        { status: 500 }
      );
    }

    // Reset ingestion status
    const { error: updateError } = await supabase
      .from('ingestions')
      .update({
        status: 'processing',
        error: null,
        progress: 10,
        updated_at: new Date().toISOString(),
      })
      .eq('id', ingestionId);

    if (updateError) {
      return NextResponse.json(
        { error: 'Failed to reset ingestion status' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: 'Jobs reset for retry',
      ingestionId,
    });

  } catch (error) {
    console.error('Retry endpoint error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}