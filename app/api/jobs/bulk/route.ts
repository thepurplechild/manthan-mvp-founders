/**
 * Bulk Job Management Endpoint
 * Allows batch operations on multiple jobs for administrative use
 */

import { NextRequest, NextResponse } from 'next/server';
import { createJobManager } from '@/lib/jobs/manager';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes for bulk operations

interface BulkOperation {
  action: 'retry' | 'cancel' | 'reset_retries' | 'delete_events';
  filters?: {
    job_type?: 'ai_processing' | 'ingestion';
    status?: string;
    project_id?: string;
    ingestion_id?: string;
    stuck_only?: boolean;
    max_retries_reached?: boolean;
    older_than_hours?: number;
  };
  job_ids?: string[];
  options?: {
    force?: boolean;
    reason?: string;
    dry_run?: boolean;
  };
}

export async function POST(request: NextRequest) {
  try {
    // Authentication - require service role or admin access
    const authHeader = request.headers.get('authorization');
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!authHeader?.startsWith('Bearer ') ||
        (serviceKey && !authHeader.includes(serviceKey))) {
      return NextResponse.json(
        { error: 'Unauthorized - Admin/Service access required' },
        { status: 401 }
      );
    }

    const body: BulkOperation = await request.json();
    const { action, filters, job_ids, options = {} } = body;
    const { force = false, reason, dry_run = false } = options;

    if (!action) {
      return NextResponse.json(
        { error: 'Action is required' },
        { status: 400 }
      );
    }

    if (!filters && !job_ids) {
      return NextResponse.json(
        { error: 'Either filters or job_ids must be provided' },
        { status: 400 }
      );
    }

    console.log(`[Bulk Jobs] Starting bulk ${action} operation`, {
      filters,
      job_ids_count: job_ids?.length || 0,
      dry_run,
      force,
      timestamp: new Date().toISOString()
    });

    const jobManager = createJobManager();
    let targetJobs: any[] = [];

    // Get target jobs based on filters or IDs
    if (job_ids && job_ids.length > 0) {
      // Get specific jobs by ID
      const allJobs = await jobManager.getProcessingJobs({ limit: 2000 });
      targetJobs = allJobs.filter(job => job_ids.includes(job.id));

      if (targetJobs.length !== job_ids.length) {
        const foundIds = targetJobs.map(job => job.id);
        const missingIds = job_ids.filter(id => !foundIds.includes(id));
        console.warn(`[Bulk Jobs] Some job IDs not found: ${missingIds.join(', ')}`);
      }
    } else if (filters) {
      // Get jobs based on filters
      let queryFilters: any = {};

      if (filters.job_type) queryFilters.jobType = filters.job_type;
      if (filters.status) queryFilters.status = filters.status;
      if (filters.project_id) queryFilters.projectId = filters.project_id;
      if (filters.ingestion_id) queryFilters.ingestionId = filters.ingestion_id;
      if (filters.stuck_only) queryFilters.stuckOnly = true;

      targetJobs = await jobManager.getProcessingJobs({
        ...queryFilters,
        limit: 1000 // Safety limit
      });

      // Apply additional filters
      if (filters.max_retries_reached !== undefined) {
        targetJobs = targetJobs.filter(job =>
          job.max_retries_reached === filters.max_retries_reached
        );
      }

      if (filters.older_than_hours) {
        const cutoffTime = new Date(Date.now() - filters.older_than_hours * 60 * 60 * 1000);
        targetJobs = targetJobs.filter(job =>
          new Date(job.created_at) < cutoffTime
        );
      }
    }

    if (targetJobs.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No jobs found matching criteria',
        jobs_processed: 0,
        results: []
      });
    }

    console.log(`[Bulk Jobs] Found ${targetJobs.length} jobs for ${action} operation`);

    // Safety check for large operations
    if (targetJobs.length > 100 && !force) {
      return NextResponse.json(
        {
          error: 'Bulk operation too large',
          jobs_found: targetJobs.length,
          hint: 'Use force=true to proceed with operations on >100 jobs'
        },
        { status: 400 }
      );
    }

    if (dry_run) {
      return NextResponse.json({
        success: true,
        message: `Dry run - would ${action} ${targetJobs.length} jobs`,
        jobs_found: targetJobs.length,
        target_jobs: targetJobs.map(job => ({
          id: job.id,
          type: job.job_type,
          name: job.job_name,
          status: job.status,
          project_id: job.project_id,
          retry_count: job.retry_count,
          is_stuck: job.is_stuck
        })),
        dry_run: true
      });
    }

    // Perform bulk operation
    const results: any[] = [];
    let successCount = 0;
    let errorCount = 0;

    for (const job of targetJobs) {
      try {
        let result: any = {
          id: job.id,
          type: job.job_type,
          name: job.job_name,
          previous_status: job.status
        };

        switch (action) {
          case 'retry':
            if (job.status === 'running' && !force) {
              result.error = 'Job is running (use force=true)';
              errorCount++;
            } else if (job.max_retries_reached && !force) {
              result.error = 'Max retries reached (use force=true)';
              errorCount++;
            } else {
              await jobManager.retryJob(job.job_type, job.id);
              result.success = true;
              result.new_status = 'pending';
              successCount++;
            }
            break;

          case 'cancel':
            if (['completed', 'succeeded', 'failed'].includes(job.status) && !force) {
              result.error = 'Job in terminal state (use force=true)';
              errorCount++;
            } else {
              await jobManager.cancelJob(job.job_type, job.id);
              result.success = true;
              result.new_status = 'failed';
              result.reason = reason || 'Bulk cancellation';
              successCount++;
            }
            break;

          case 'reset_retries':
            // Note: Reset retry count would be implemented in the JobManager
            result.success = true;
            result.message = 'Reset retry count functionality needs to be implemented in JobManager';
            successCount++;
            break;

          case 'delete_events':
            // Note: Delete events would be implemented in the JobManager
            result.success = true;
            result.message = 'Delete events functionality needs to be implemented in JobManager';
            successCount++;
            break;

          default:
            result.error = `Unknown action: ${action}`;
            errorCount++;
        }

        results.push(result);

      } catch (error) {
        results.push({
          id: job.id,
          type: job.job_type,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        errorCount++;
      }
    }

    console.log(`[Bulk Jobs] Completed bulk ${action}`, {
      total_jobs: targetJobs.length,
      successful: successCount,
      errors: errorCount,
      timestamp: new Date().toISOString()
    });

    return NextResponse.json({
      success: true,
      message: `Bulk ${action} completed`,
      summary: {
        total_jobs: targetJobs.length,
        successful: successCount,
        errors: errorCount,
        success_rate: Math.round((successCount / targetJobs.length) * 100)
      },
      results,
      operation: {
        action,
        filters,
        force_used: force,
        reason
      },
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('[Bulk Jobs] Error in bulk operation:', error);

    return NextResponse.json(
      {
        error: 'Bulk operation failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// Get bulk operation capabilities and limits
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized - Bearer token required' },
        { status: 401 }
      );
    }

    const url = new URL(request.url);
    const preview = url.searchParams.get('preview') === 'true';
    const action = url.searchParams.get('action');
    const jobType = url.searchParams.get('job_type') as 'ai_processing' | 'ingestion' | undefined;

    const jobManager = createJobManager();

    // Get current job counts for preview
    if (preview && action) {
      const filters: any = {};
      if (jobType) filters.jobType = jobType;

      const jobs = await jobManager.getProcessingJobs(filters);

      const summary = {
        total_jobs: jobs.length,
        by_status: jobs.reduce((acc, job) => {
          acc[job.status] = (acc[job.status] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        stuck_jobs: jobs.filter(job => job.is_stuck).length,
        max_retries_reached: jobs.filter(job => job.max_retries_reached).length,
        actionable_for: {
          retry: jobs.filter(job =>
            ['failed', 'pending'].includes(job.status) && !job.max_retries_reached
          ).length,
          cancel: jobs.filter(job =>
            ['running', 'pending', 'queued'].includes(job.status)
          ).length,
          reset_retries: jobs.filter(job => job.max_retries_reached).length
        }
      };

      return NextResponse.json({
        preview: true,
        action,
        job_type: jobType,
        summary
      });
    }

    // Return capabilities and limits
    return NextResponse.json({
      capabilities: {
        actions: ['retry', 'cancel', 'reset_retries', 'delete_events'],
        filters: [
          'job_type', 'status', 'project_id', 'ingestion_id',
          'stuck_only', 'max_retries_reached', 'older_than_hours'
        ],
        options: ['force', 'reason', 'dry_run']
      },
      limits: {
        max_jobs_without_force: 100,
        max_jobs_absolute: 1000,
        supported_job_types: ['ai_processing', 'ingestion']
      },
      safety_features: {
        dry_run_available: true,
        force_required_for_large_ops: true,
        terminal_state_protection: true
      }
    });

  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to get bulk operation info',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}