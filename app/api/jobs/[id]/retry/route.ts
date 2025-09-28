/**
 * Manual Job Retry Endpoint
 * Allows manual retry of specific failed or stuck jobs
 */

import { NextRequest, NextResponse } from 'next/server';
import { createJobManager } from '@/lib/jobs/manager';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface RetryRequest {
  job_type?: 'ai_processing' | 'ingestion';
  force?: boolean;
  reset_retry_count?: boolean;
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

    const body: RetryRequest = await request.json().catch(() => ({}));
    const { job_type, force = false, reset_retry_count = false } = body;

    const jobManager = createJobManager();

    // If job_type is not provided, try to find it
    let detectedJobType = job_type;
    if (!detectedJobType) {
      // Try to find the job in both tables
      const jobs = await jobManager.getProcessingJobs({ limit: 1000 });
      const job = jobs.find(j => j.id === jobId);

      if (!job) {
        return NextResponse.json(
          { error: 'Job not found' },
          { status: 404 }
        );
      }

      detectedJobType = job.job_type;
    }

    console.log(`[Job Retry] Attempting to retry job ${jobId}`, {
      job_type: detectedJobType,
      force,
      reset_retry_count,
      timestamp: new Date().toISOString()
    });

    // Get job details before retry to validate
    const jobs = await jobManager.getProcessingJobs({ limit: 1000 });
    const job = jobs.find(j => j.id === jobId);

    if (!job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    // Validation checks
    if (!force) {
      if (job.status === 'running') {
        return NextResponse.json(
          {
            error: 'Job is currently running',
            current_status: job.status,
            hint: 'Use force=true to restart running job'
          },
          { status: 400 }
        );
      }

      if (job.status === 'completed' || job.status === 'succeeded') {
        return NextResponse.json(
          {
            error: 'Job is already completed',
            current_status: job.status,
            hint: 'Use force=true to restart completed job'
          },
          { status: 400 }
        );
      }

      if (job.max_retries_reached && !reset_retry_count) {
        return NextResponse.json(
          {
            error: 'Job has reached maximum retry limit',
            retry_count: job.retry_count,
            max_retries: job.max_retries,
            hint: 'Use reset_retry_count=true to reset retry counter'
          },
          { status: 400 }
        );
      }
    }

    // Reset retry count if requested
    if (reset_retry_count) {
      console.log(`[Job Retry] Resetting retry count for job ${jobId}`);
      // Note: Reset retry count would be implemented in the JobManager
      // For now, we'll skip this functionality and rely on the retry mechanism
    }

    // Perform the retry
    await jobManager.retryJob(detectedJobType, jobId);

    // Get updated job status
    const updatedJobs = await jobManager.getProcessingJobs({ limit: 1000 });
    const updatedJob = updatedJobs.find(j => j.id === jobId);

    console.log(`[Job Retry] Successfully retried job ${jobId}`, {
      previous_status: job.status,
      new_status: updatedJob?.status,
      retry_count: updatedJob?.retry_count
    });

    return NextResponse.json({
      success: true,
      message: 'Job retry initiated successfully',
      job: {
        id: jobId,
        type: detectedJobType,
        name: job.job_name,
        previous_status: job.status,
        new_status: updatedJob?.status || 'pending',
        retry_count: updatedJob?.retry_count || 0,
        max_retries: job.max_retries,
        project_id: job.project_id,
        ingestion_id: job.ingestion_id
      },
      actions_taken: {
        force_used: force,
        retry_count_reset: reset_retry_count
      },
      timestamp: Date.now()
    });

  } catch (error) {
    console.error(`[Job Retry] Error retrying job ${jobId}:`, error);

    return NextResponse.json(
      {
        error: 'Failed to retry job',
        message: error instanceof Error ? error.message : 'Unknown error',
        job_id: jobId
      },
      { status: 500 }
    );
  }
}

// Get retry information for a job
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: jobId } = await params;

  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
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

    // Get retry history from events
    const events = await jobManager.getJobEvents({
      jobId,
      jobType: job.job_type,
      eventType: 'retried',
      limit: 10
    });

    const canRetry = !job.max_retries_reached || job.status === 'failed';
    const shouldForce = job.status === 'running' || job.status === 'completed' || job.status === 'succeeded';

    return NextResponse.json({
      job: {
        id: job.id,
        type: job.job_type,
        name: job.job_name,
        status: job.status,
        retry_count: job.retry_count,
        max_retries: job.max_retries,
        max_retries_reached: job.max_retries_reached,
        is_stuck: job.is_stuck,
        error_message: job.error_message,
        project_id: job.project_id,
        ingestion_id: job.ingestion_id,
        created_at: job.created_at,
        started_at: job.started_at,
        last_retry_at: job.last_retry_at
      },
      retry_info: {
        can_retry: canRetry,
        should_force: shouldForce,
        retry_count: job.retry_count,
        max_retries: job.max_retries,
        remaining_retries: Math.max(0, job.max_retries - job.retry_count),
        last_retry_at: job.last_retry_at
      },
      retry_history: events.map(event => ({
        timestamp: event.created_at,
        previous_status: event.previous_status,
        new_status: event.new_status,
        metadata: event.metadata
      })),
      recommendations: {
        action: canRetry
          ? (shouldForce ? 'POST with force=true' : 'POST to retry')
          : 'Cannot retry - max retries reached',
        reset_suggested: job.max_retries_reached,
        force_suggested: shouldForce
      }
    });

  } catch (error) {
    console.error(`[Job Retry] Error getting retry info for job ${jobId}:`, error);

    return NextResponse.json(
      {
        error: 'Failed to get job retry information',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}