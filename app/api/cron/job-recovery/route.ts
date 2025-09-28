/**
 * Cron Job Recovery Endpoint
 * Automated job recovery that runs every 5 minutes via Vercel Cron
 * Monitors and recovers stuck processing jobs to maintain system reliability
 */

import { NextRequest, NextResponse } from 'next/server';
import { createJobManager } from '@/lib/jobs/manager';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes

// Cron job metrics for monitoring
interface CronMetrics {
  execution_count: number;
  last_execution: number;
  total_recovered: number;
  total_errors: number;
  avg_execution_time_ms: number;
}

// Simple in-memory store for cron metrics (consider Redis for production)
const cronMetrics: CronMetrics = {
  execution_count: 0,
  last_execution: 0,
  total_recovered: 0,
  total_errors: 0,
  avg_execution_time_ms: 0
};

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Verify cron authentication
    const authHeader = request.headers.get('authorization');
    const cronSecret = request.headers.get('x-cron-secret');

    // Vercel cron jobs include a special header
    const vercelCron = request.headers.get('x-vercel-cron');

    if (!vercelCron && !cronSecret && !authHeader) {
      console.error('[Cron Recovery] Unauthorized access attempt');
      return NextResponse.json(
        { error: 'Unauthorized - Cron access only' },
        { status: 401 }
      );
    }

    // Validate cron secret if provided
    if (cronSecret && cronSecret !== process.env.CRON_SECRET) {
      console.error('[Cron Recovery] Invalid cron secret');
      return NextResponse.json(
        { error: 'Invalid cron secret' },
        { status: 403 }
      );
    }

    console.log('[Cron Recovery] Starting automated job recovery', {
      timestamp: new Date().toISOString(),
      execution_count: cronMetrics.execution_count + 1,
      vercel_cron: !!vercelCron
    });

    const jobManager = createJobManager();

    // Get system health first
    const health = await jobManager.getSystemHealth();

    console.log('[Cron Recovery] System health check', {
      healthy: health.healthy,
      issues: health.issues,
      metrics: health.metrics
    });

    // Only proceed with recovery if there are stuck jobs
    if (health.metrics.stuck_jobs === 0) {
      const executionTime = Date.now() - startTime;

      // Update metrics
      cronMetrics.execution_count++;
      cronMetrics.last_execution = startTime;
      cronMetrics.avg_execution_time_ms =
        (cronMetrics.avg_execution_time_ms * (cronMetrics.execution_count - 1) + executionTime) / cronMetrics.execution_count;

      console.log('[Cron Recovery] No stuck jobs found - system healthy', {
        execution_time_ms: executionTime,
        total_active_jobs: health.metrics.total_active_jobs
      });

      return NextResponse.json({
        success: true,
        message: 'No stuck jobs found',
        timestamp: startTime,
        execution_time_ms: executionTime,
        system_health: health,
        metrics: cronMetrics
      });
    }

    // Perform recovery operation
    const recoveryResult = await jobManager.recoverStuckJobs();

    const executionTime = Date.now() - startTime;

    // Update metrics
    cronMetrics.execution_count++;
    cronMetrics.last_execution = startTime;
    cronMetrics.total_recovered += recoveryResult.recovered_count;
    cronMetrics.avg_execution_time_ms =
      (cronMetrics.avg_execution_time_ms * (cronMetrics.execution_count - 1) + executionTime) / cronMetrics.execution_count;

    console.log('[Cron Recovery] Recovery operation completed', {
      recovered_count: recoveryResult.recovered_count,
      execution_time_ms: executionTime,
      jobs_recovered: recoveryResult.jobs.map(job => ({
        id: job.id,
        type: job.type,
        name: job.name,
        previous_status: job.previous_status
      }))
    });

    // Check if we should alert on high recovery counts
    const alerts: string[] = [];
    if (recoveryResult.recovered_count > 10) {
      alerts.push(`High recovery count: ${recoveryResult.recovered_count} jobs recovered`);
    }

    if (executionTime > 60000) { // 1 minute
      alerts.push(`Slow recovery execution: ${Math.round(executionTime / 1000)}s`);
    }

    return NextResponse.json({
      success: true,
      message: `Recovered ${recoveryResult.recovered_count} stuck jobs`,
      timestamp: startTime,
      execution_time_ms: executionTime,
      recovery_result: recoveryResult,
      system_health: health,
      metrics: cronMetrics,
      alerts
    });

  } catch (error) {
    const executionTime = Date.now() - startTime;

    // Update error metrics
    cronMetrics.execution_count++;
    cronMetrics.last_execution = startTime;
    cronMetrics.total_errors++;
    cronMetrics.avg_execution_time_ms =
      (cronMetrics.avg_execution_time_ms * (cronMetrics.execution_count - 1) + executionTime) / cronMetrics.execution_count;

    console.error('[Cron Recovery] Error during automated recovery', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      execution_time_ms: executionTime,
      timestamp: new Date().toISOString()
    });

    return NextResponse.json(
      {
        success: false,
        error: 'Recovery operation failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: startTime,
        execution_time_ms: executionTime,
        metrics: cronMetrics
      },
      { status: 500 }
    );
  }
}

// Health check for the cron job itself
export async function HEAD() {
  try {
    // Check if cron is running regularly (within last 10 minutes)
    const timeSinceLastExecution = Date.now() - cronMetrics.last_execution;
    const maxAllowedGap = 10 * 60 * 1000; // 10 minutes

    if (cronMetrics.execution_count === 0) {
      // Never executed
      return new NextResponse(null, {
        status: 503,
        headers: {
          'X-Cron-Status': 'never-executed',
          'X-Execution-Count': '0'
        }
      });
    }

    if (timeSinceLastExecution > maxAllowedGap) {
      // Stale - hasn't run recently
      return new NextResponse(null, {
        status: 503,
        headers: {
          'X-Cron-Status': 'stale',
          'X-Minutes-Since-Last': Math.round(timeSinceLastExecution / 60000).toString()
        }
      });
    }

    // Healthy
    return new NextResponse(null, {
      status: 200,
      headers: {
        'X-Cron-Status': 'healthy',
        'X-Execution-Count': cronMetrics.execution_count.toString(),
        'X-Total-Recovered': cronMetrics.total_recovered.toString(),
        'X-Error-Rate': cronMetrics.execution_count > 0
          ? Math.round((cronMetrics.total_errors / cronMetrics.execution_count) * 100).toString()
          : '0'
      }
    });

  } catch (error) {
    return new NextResponse(null, {
      status: 500,
      headers: {
        'X-Cron-Status': 'error',
        'X-Error': error instanceof Error ? error.message : 'Unknown error'
      }
    });
  }
}

// Manual trigger endpoint for testing
export async function POST(request: NextRequest) {
  try {
    // Require authentication for manual triggers
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized - Bearer token required for manual trigger' },
        { status: 401 }
      );
    }

    console.log('[Cron Recovery] Manual trigger initiated');

    // Create a synthetic cron request by calling GET
    const cronRequest = new NextRequest(request.url, {
      method: 'GET',
      headers: {
        'x-cron-secret': process.env.CRON_SECRET || 'manual-trigger',
        'authorization': authHeader
      }
    });

    return await GET(cronRequest);

  } catch (error) {
    console.error('[Cron Recovery] Error in manual trigger:', error);

    return NextResponse.json(
      {
        error: 'Manual trigger failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// Metrics endpoint for monitoring
export async function PUT(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized - Bearer token required' },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { reset = false } = body;

    if (reset) {
      // Reset metrics
      cronMetrics.execution_count = 0;
      cronMetrics.last_execution = 0;
      cronMetrics.total_recovered = 0;
      cronMetrics.total_errors = 0;
      cronMetrics.avg_execution_time_ms = 0;

      console.log('[Cron Recovery] Metrics reset');

      return NextResponse.json({
        success: true,
        message: 'Cron metrics reset',
        metrics: cronMetrics
      });
    }

    // Return current metrics
    return NextResponse.json({
      success: true,
      metrics: cronMetrics,
      status: {
        healthy: cronMetrics.execution_count > 0 &&
                (Date.now() - cronMetrics.last_execution) < 10 * 60 * 1000,
        error_rate: cronMetrics.execution_count > 0
          ? Math.round((cronMetrics.total_errors / cronMetrics.execution_count) * 100)
          : 0,
        avg_execution_time_seconds: Math.round(cronMetrics.avg_execution_time_ms / 1000),
        minutes_since_last_execution: Math.round((Date.now() - cronMetrics.last_execution) / 60000)
      }
    });

  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to handle metrics request',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}