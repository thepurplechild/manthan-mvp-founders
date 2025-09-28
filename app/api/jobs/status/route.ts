/**
 * Job Status Monitoring API
 * Provides comprehensive job queue status, statistics, and system health monitoring
 */

import { NextRequest, NextResponse } from 'next/server';
import { createJobManager } from '@/lib/jobs/manager';

export const runtime = 'nodejs';
export const maxDuration = 60; // 1 minute

interface StatusQuery {
  hours?: number;
  project_id?: string;
  job_type?: 'ai_processing' | 'ingestion';
  include_events?: boolean;
  include_details?: boolean;
  status_filter?: string;
}

export async function GET(request: NextRequest) {
  try {
    // Basic authentication
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized - Bearer token required' },
        { status: 401 }
      );
    }

    const url = new URL(request.url);
    const hours = parseInt(url.searchParams.get('hours') || '24');
    const projectId = url.searchParams.get('project_id') || undefined;
    const jobType = url.searchParams.get('job_type') as 'ai_processing' | 'ingestion' | undefined;
    const includeEvents = url.searchParams.get('include_events') === 'true';
    const includeDetails = url.searchParams.get('include_details') === 'true';
    const statusFilter = url.searchParams.get('status') || undefined;

    // Validate hours parameter
    if (isNaN(hours) || hours < 1 || hours > 168) { // Max 7 days
      return NextResponse.json(
        { error: 'Invalid hours parameter. Must be between 1 and 168 (7 days)' },
        { status: 400 }
      );
    }

    const jobManager = createJobManager();

    // Get system statistics
    const statistics = await jobManager.getJobStatistics(hours);

    // Get current active jobs
    const activeJobs = await jobManager.getProcessingJobs({
      jobType,
      projectId,
      status: statusFilter as any,
      limit: includeDetails ? 100 : undefined
    });

    // Get stuck jobs
    const stuckJobs = await jobManager.getProcessingJobs({
      stuckOnly: true,
      jobType,
      projectId,
      limit: 50
    });

    // Get system health
    const health = await jobManager.getSystemHealth();

    // Base response
    const response: any = {
      timestamp: Date.now(),
      period_hours: hours,
      system_health: health,
      statistics,
      summary: {
        total_active_jobs: activeJobs.length,
        stuck_jobs: stuckJobs.length,
        jobs_by_status: activeJobs.reduce((acc, job) => {
          acc[job.status] = (acc[job.status] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        jobs_by_type: activeJobs.reduce((acc, job) => {
          acc[job.job_type] = (acc[job.job_type] || 0) + 1;
          return acc;
        }, {} as Record<string, number>)
      }
    };

    // Add detailed job information if requested
    if (includeDetails) {
      response.active_jobs = activeJobs.map(job => ({
        id: job.id,
        type: job.job_type,
        name: job.job_name,
        status: job.status,
        project_id: job.project_id,
        ingestion_id: job.ingestion_id,
        created_at: job.created_at,
        started_at: job.started_at,
        processing_duration_ms: job.processing_duration_ms,
        retry_count: job.retry_count,
        max_retries: job.max_retries,
        priority: job.priority,
        is_stuck: job.is_stuck,
        last_heartbeat: job.last_heartbeat,
        error_message: job.error_message
      }));

      response.stuck_jobs = stuckJobs.map(job => ({
        id: job.id,
        type: job.job_type,
        name: job.job_name,
        status: job.status,
        project_id: job.project_id,
        created_at: job.created_at,
        started_at: job.started_at,
        retry_count: job.retry_count,
        recovery_count: job.recovery_count,
        time_stuck_minutes: job.started_at
          ? Math.round((Date.now() - new Date(job.started_at).getTime()) / 60000)
          : Math.round((Date.now() - new Date(job.created_at).getTime()) / 60000)
      }));
    }

    // Add job events if requested
    if (includeEvents) {
      const events = await jobManager.getJobEvents({
        jobType,
        projectId,
        hoursBack: Math.min(hours, 24), // Limit events to 24 hours max
        limit: 100
      });

      response.recent_events = events.map(event => ({
        id: event.id,
        job_type: event.job_type,
        job_id: event.job_id,
        event_type: event.event_type,
        previous_status: event.previous_status,
        new_status: event.new_status,
        project_id: event.project_id,
        ingestion_id: event.ingestion_id,
        processing_duration_ms: event.processing_duration_ms,
        error_details: event.error_details,
        created_at: event.created_at
      }));
    }

    // Add performance metrics
    response.performance = {
      avg_processing_time_minutes: statistics.overall.avg_processing_time_ms
        ? Math.round(statistics.overall.avg_processing_time_ms / 60000)
        : 0,
      success_rate: statistics.overall.total_jobs > 0
        ? Math.round((statistics.overall.completed_count / statistics.overall.total_jobs) * 100)
        : 100,
      queue_depth: statistics.overall.queued_count,
      processing_capacity_used: statistics.overall.processing_count,
      failure_rate: statistics.overall.total_jobs > 0
        ? Math.round((statistics.overall.failed_count / statistics.overall.total_jobs) * 100)
        : 0
    };

    // Add alerts based on thresholds
    const alerts: string[] = [];

    if (stuckJobs.length > 0) {
      alerts.push(`${stuckJobs.length} jobs are stuck and may need recovery`);
    }

    if (response.performance.failure_rate > 20) {
      alerts.push(`High failure rate: ${response.performance.failure_rate}%`);
    }

    if (response.performance.queue_depth > 50) {
      alerts.push(`Large queue: ${response.performance.queue_depth} jobs waiting`);
    }

    if (response.performance.avg_processing_time_minutes > 30) {
      alerts.push(`Slow processing: avg ${response.performance.avg_processing_time_minutes} minutes`);
    }

    response.alerts = alerts;

    return NextResponse.json(response);

  } catch (error) {
    console.error('[Job Status] Error getting job status:', error);

    return NextResponse.json(
      {
        error: 'Failed to get job status',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now()
      },
      { status: 500 }
    );
  }
}

// Simplified health check endpoint
export async function HEAD() {
  try {
    const jobManager = createJobManager();
    const health = await jobManager.getSystemHealth();

    // Return different status codes based on health
    if (health.healthy) {
      return new NextResponse(null, {
        status: 200,
        headers: {
          'X-Health-Status': 'healthy',
          'X-Active-Jobs': health.metrics.total_active_jobs.toString(),
          'X-Stuck-Jobs': health.metrics.stuck_jobs.toString()
        }
      });
    } else if (health.metrics.stuck_jobs > 0) {
      return new NextResponse(null, {
        status: 206, // Partial Content - degraded but functional
        headers: {
          'X-Health-Status': 'degraded',
          'X-Issues': health.issues.join('; ')
        }
      });
    } else {
      return new NextResponse(null, {
        status: 503, // Service Unavailable
        headers: {
          'X-Health-Status': 'unhealthy',
          'X-Issues': health.issues.join('; ')
        }
      });
    }
  } catch (error) {
    return new NextResponse(null, {
      status: 500,
      headers: {
        'X-Health-Status': 'error',
        'X-Error': error instanceof Error ? error.message : 'Unknown error'
      }
    });
  }
}

// POST endpoint for custom status queries
export async function POST(request: NextRequest) {
  try {
    // Authentication
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized - Bearer token required' },
        { status: 401 }
      );
    }

    const body: StatusQuery = await request.json();
    const {
      hours = 24,
      project_id,
      job_type,
      include_events = false,
      include_details = false,
      status_filter
    } = body;

    // Validate input
    if (hours < 1 || hours > 168) {
      return NextResponse.json(
        { error: 'Invalid hours parameter. Must be between 1 and 168' },
        { status: 400 }
      );
    }

    const jobManager = createJobManager();

    // Get filtered statistics
    const statistics = await jobManager.getJobStatistics(hours);

    // Get jobs with filters
    const jobs = await jobManager.getProcessingJobs({
      jobType: job_type,
      projectId: project_id,
      status: status_filter as any,
      limit: include_details ? 200 : undefined
    });

    // Custom analysis based on filters
    const analysis = {
      total_jobs: jobs.length,
      status_breakdown: jobs.reduce((acc, job) => {
        acc[job.status] = (acc[job.status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      avg_retry_count: jobs.length > 0
        ? jobs.reduce((sum, job) => sum + job.retry_count, 0) / jobs.length
        : 0,
      stuck_jobs: jobs.filter(job => job.is_stuck).length,
      high_priority_jobs: jobs.filter(job => job.priority <= 2).length
    };

    const response: any = {
      timestamp: Date.now(),
      query: { hours, project_id, job_type, status_filter },
      statistics,
      analysis
    };

    if (include_details) {
      response.jobs = jobs;
    }

    if (include_events) {
      const events = await jobManager.getJobEvents({
        jobType: job_type,
        projectId: project_id,
        hoursBack: Math.min(hours, 24),
        limit: 100
      });
      response.events = events;
    }

    return NextResponse.json(response);

  } catch (error) {
    console.error('[Job Status] Error processing custom status query:', error);

    return NextResponse.json(
      {
        error: 'Failed to process status query',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}