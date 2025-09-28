/**
 * Job Cancellation Endpoint
 * Allows manual cancellation of running or queued jobs
 */

import { NextRequest, NextResponse } from 'next/server';
import { createJobManager } from '@/lib/jobs/manager';

export const runtime = 'nodejs';
export const maxDuration = 30;

interface CancelRequest {
  reason?: string;
  force?: boolean;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: jobId } = await params;

  try {
    // Authentication
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized - Bearer token required' },
        { status: 401 }
      );
    }
    if (!jobId) {
      return NextResponse.json(
        { error: 'Job ID is required' },
        { status: 400 }
      );
    }

    const body: CancelRequest = await request.json().catch(() => ({}));
    const { reason = 'Cancelled by user', force = false } = body;

    const jobManager = createJobManager();

    // Find the job first
    const jobs = await jobManager.getProcessingJobs({ limit: 1000 });
    const job = jobs.find(j => j.id === jobId);

    if (!job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    console.log(`[Job Cancel] Attempting to cancel job ${jobId}`, {
      job_type: job.job_type,
      current_status: job.status,
      reason,
      force,
      timestamp: new Date().toISOString()
    });

    // Validation checks
    if (!force) {
      if (job.status === 'completed' || job.status === 'succeeded') {
        return NextResponse.json(
          {
            error: 'Cannot cancel completed job',
            current_status: job.status,
            hint: 'Use force=true to mark completed job as cancelled (for audit purposes)'
          },
          { status: 400 }
        );
      }

      if (job.status === 'failed') {
        return NextResponse.json(
          {
            error: 'Job is already failed',
            current_status: job.status,
            hint: 'Job is already in a terminal state'
          },
          { status: 400 }
        );
      }
    }

    // Perform the cancellation
    await jobManager.cancelJob(job.job_type, jobId);

    // Get updated job status
    const updatedJobs = await jobManager.getProcessingJobs({ limit: 1000 });
    const updatedJob = updatedJobs.find(j => j.id === jobId);

    console.log(`[Job Cancel] Successfully cancelled job ${jobId}`, {
      previous_status: job.status,
      new_status: updatedJob?.status,
      reason
    });

    return NextResponse.json({
      success: true,
      message: 'Job cancelled successfully',
      job: {
        id: jobId,
        type: job.job_type,
        name: job.job_name,
        previous_status: job.status,
        new_status: updatedJob?.status || 'failed',
        project_id: job.project_id,
        ingestion_id: job.ingestion_id,
        cancellation_reason: reason
      },
      actions_taken: {
        force_used: force,
        reason_provided: reason
      },
      timestamp: Date.now()
    });

  } catch (error) {
    console.error(`[Job Cancel] Error cancelling job ${jobId}:`, error);

    return NextResponse.json(
      {
        error: 'Failed to cancel job',
        message: error instanceof Error ? error.message : 'Unknown error',
        job_id: jobId
      },
      { status: 500 }
    );
  }
}

// Get cancellation information for a job
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: jobId } = await params;

  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ') && !request.headers.get('x-cron-secret')) {
      return NextResponse.json(
        { error: 'Unauthorized - Bearer token required' },
        { status: 401 }
      );
    }
    const jobManager = createJobManager();

    // Find the job
    const jobs = await jobManager.getProcessingJobs({ limit: 1000 });
    const job = jobs.find(j => j.id === jobId);

    if (!job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    // Get cancellation history from events
    const events = await jobManager.getJobEvents({
      jobId,
      jobType: job.job_type,
      eventType: 'cancelled',
      limit: 5
    });

    const canCancel = job.status === 'running' || job.status === 'pending' || job.status === 'queued';
    const requiresForce = job.status === 'completed' || job.status === 'succeeded';

    return NextResponse.json({
      job: {
        id: job.id,
        type: job.job_type,
        name: job.job_name,
        status: job.status,
        project_id: job.project_id,
        ingestion_id: job.ingestion_id,
        created_at: job.created_at,
        started_at: job.started_at,
        error_message: job.error_message
      },
      cancellation_info: {
        can_cancel: canCancel,
        requires_force: requiresForce,
        current_status: job.status,
        is_terminal: ['completed', 'succeeded', 'failed'].includes(job.status)
      },
      cancellation_history: events.map(event => ({
        timestamp: event.created_at,
        previous_status: event.previous_status,
        metadata: event.metadata
      })),
      recommendations: {
        action: canCancel
          ? 'POST to cancel'
          : requiresForce
          ? 'POST with force=true to mark as cancelled'
          : 'Cannot cancel - job is in terminal state',
        force_required: requiresForce
      }
    });

  } catch (error) {
    console.error(`[Job Cancel] Error getting cancellation info for job ${jobId}:`, error);

    return NextResponse.json(
      {
        error: 'Failed to get job cancellation information',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}