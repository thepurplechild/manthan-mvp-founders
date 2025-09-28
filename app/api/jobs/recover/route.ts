/**
 * Job Recovery API Endpoint
 * Automatically detects and restarts stuck processing jobs
 */

import { NextRequest, NextResponse } from 'next/server';
import { createJobManager } from '@/lib/jobs/manager';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes

// Rate limiting for recovery operations
const RECOVERY_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
let lastRecoveryTime = 0;

interface RecoveryRequest {
  force?: boolean;
  job_type?: 'ai_processing' | 'ingestion';
  project_id?: string;
  max_retries_override?: number;
}

export async function POST(request: NextRequest) {
  try {
    // Authentication check
    const authHeader = request.headers.get('authorization');
    const cronSecret = request.headers.get('x-cron-secret');

    // Allow cron jobs with secret or authenticated requests
    const isAuthorizedCron = cronSecret === process.env.CRON_SECRET;
    const isServiceRequest = authHeader?.startsWith('Bearer ' + process.env.SUPABASE_SERVICE_ROLE_KEY);

    if (!isAuthorizedCron && !isServiceRequest) {
      return NextResponse.json(
        { error: 'Unauthorized - Missing valid authentication' },
        { status: 401 }
      );
    }

    const body: RecoveryRequest = await request.json().catch(() => ({}));
    const { force = false, job_type, project_id, max_retries_override } = body;

    // Rate limiting (can be bypassed with force flag)
    const now = Date.now();
    if (!force && (now - lastRecoveryTime) < RECOVERY_COOLDOWN_MS) {
      const remainingCooldown = Math.ceil((RECOVERY_COOLDOWN_MS - (now - lastRecoveryTime)) / 1000);
      return NextResponse.json(
        {
          error: 'Recovery operation in cooldown',
          remaining_seconds: remainingCooldown,
          hint: 'Use force=true to bypass cooldown'
        },
        { status: 429 }
      );
    }

    const jobManager = createJobManager();

    // Get stuck jobs with optional filters
    const stuckJobs = await jobManager.getProcessingJobs({
      stuckOnly: true,
      jobType: job_type,
      projectId: project_id,
      limit: 100 // Safety limit
    });

    console.log(`[Job Recovery] Found ${stuckJobs.length} stuck jobs`, {
      job_type,
      project_id,
      force,
      timestamp: new Date().toISOString()
    });

    if (stuckJobs.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No stuck jobs found',
        recovered_count: 0,
        jobs: [],
        timestamp: Date.now()
      });
    }

    // Filter jobs that haven't exceeded max retries (unless overridden)
    const recoverableJobs = stuckJobs.filter(job => {
      if (max_retries_override !== undefined) {
        return job.retry_count < max_retries_override;
      }
      return !job.max_retries_reached;
    });

    console.log(`[Job Recovery] ${recoverableJobs.length} jobs are recoverable (not at max retries)`);

    if (recoverableJobs.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'All stuck jobs have reached maximum retry limit',
        recovered_count: 0,
        jobs: stuckJobs.map(job => ({
          id: job.id,
          type: job.job_type,
          name: job.job_name,
          status: job.status,
          retry_count: job.retry_count,
          max_retries: job.max_retries,
          reason: 'max_retries_reached'
        })),
        timestamp: Date.now()
      });
    }

    // Perform recovery using database function for atomic operations
    const recoveryResult = await jobManager.recoverStuckJobs();

    // Update rate limiting timestamp
    lastRecoveryTime = now;

    // Log recovery operation
    console.log(`[Job Recovery] Successfully recovered ${recoveryResult.recovered_count} jobs`, {
      jobs: recoveryResult.jobs,
      timestamp: new Date().toISOString()
    });

    // Detailed response for monitoring
    return NextResponse.json({
      success: true,
      message: `Successfully recovered ${recoveryResult.recovered_count} stuck jobs`,
      ...recoveryResult,
      recovery_details: {
        total_stuck_found: stuckJobs.length,
        recoverable_jobs: recoverableJobs.length,
        max_retries_reached: stuckJobs.length - recoverableJobs.length,
        force_used: force,
        cooldown_bypassed: force && ((now - lastRecoveryTime) < RECOVERY_COOLDOWN_MS)
      }
    });

  } catch (error) {
    console.error('[Job Recovery] Error during recovery operation:', error);

    return NextResponse.json(
      {
        error: 'Failed to recover stuck jobs',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now()
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    // Simple authentication for GET requests
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized - Bearer token required' },
        { status: 401 }
      );
    }

    const url = new URL(request.url);
    const jobType = url.searchParams.get('job_type') as 'ai_processing' | 'ingestion' | undefined;
    const projectId = url.searchParams.get('project_id') || undefined;
    const includeDetails = url.searchParams.get('details') === 'true';

    const jobManager = createJobManager();

    // Get stuck jobs for analysis
    const stuckJobs = await jobManager.getProcessingJobs({
      stuckOnly: true,
      jobType,
      projectId,
      limit: 50
    });

    const response: any = {
      stuck_jobs_count: stuckJobs.length,
      last_recovery_time: lastRecoveryTime,
      cooldown_remaining_ms: Math.max(0, RECOVERY_COOLDOWN_MS - (Date.now() - lastRecoveryTime)),
      timestamp: Date.now()
    };

    if (includeDetails) {
      response.stuck_jobs = stuckJobs.map(job => ({
        id: job.id,
        type: job.job_type,
        name: job.job_name,
        status: job.status,
        created_at: job.created_at,
        started_at: job.started_at,
        retry_count: job.retry_count,
        max_retries: job.max_retries,
        recovery_count: job.recovery_count,
        project_id: job.project_id,
        ingestion_id: job.ingestion_id,
        is_recoverable: !job.max_retries_reached
      }));

      // Add recovery recommendations
      const recoverableCount = stuckJobs.filter(job => !job.max_retries_reached).length;
      response.recovery_recommendation = {
        should_recover: recoverableCount > 0,
        recoverable_jobs: recoverableCount,
        max_retries_reached: stuckJobs.length - recoverableCount,
        suggested_action: recoverableCount > 0 ? 'POST to /api/jobs/recover' : 'Manual investigation required'
      };
    }

    return NextResponse.json(response);

  } catch (error) {
    console.error('[Job Recovery] Error getting stuck jobs info:', error);

    return NextResponse.json(
      {
        error: 'Failed to get stuck jobs information',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// Health check endpoint
export async function HEAD() {
  try {
    const jobManager = createJobManager();
    const health = await jobManager.getSystemHealth();

    if (health.healthy) {
      return new NextResponse(null, { status: 200 });
    } else {
      return new NextResponse(null, { status: 503 }); // Service Unavailable
    }
  } catch (error) {
    return new NextResponse(null, { status: 500 });
  }
}