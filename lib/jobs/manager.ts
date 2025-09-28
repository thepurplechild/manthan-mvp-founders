/**
 * Job Management Utilities
 * Provides comprehensive job state management, recovery, and monitoring capabilities
 */

import { createClient } from '@supabase/supabase-js';

// Job types and statuses
export type JobType = 'ai_processing' | 'ingestion';
export type JobStatus = 'pending' | 'queued' | 'running' | 'completed' | 'succeeded' | 'failed' | 'skipped';
export type JobEventType = 'created' | 'started' | 'completed' | 'failed' | 'retried' | 'cancelled' | 'recovered';

export interface ProcessingJob {
  id: string;
  job_type: JobType;
  project_id?: string;
  ingestion_id?: string;
  job_name: string;
  status: JobStatus;
  started_at?: string;
  finished_at?: string;
  retry_count: number;
  max_retries: number;
  last_retry_at?: string;
  error_message?: string;
  processing_duration_ms?: number;
  priority: number;
  recovery_count: number;
  last_heartbeat?: string;
  created_at: string;
  is_stuck: boolean;
  max_retries_reached: boolean;
}

export interface JobStatistics {
  period_hours: number;
  timestamp: number;
  overall: {
    total_jobs: number;
    queued_count: number;
    processing_count: number;
    failed_count: number;
    completed_count: number;
    stuck_count: number;
    avg_processing_time_ms: number;
  };
  by_type_and_status: Record<string, {
    count: number;
    avg_duration_ms: number;
    max_duration_ms: number;
    min_duration_ms: number;
  }>;
}

export interface JobRecoveryResult {
  recovered_count: number;
  jobs: Array<{
    id: string;
    type: JobType;
    name: string;
    previous_status: string;
    project_id?: string;
  }>;
  timestamp: number;
}

export class JobManager {
  private supabase: ReturnType<typeof createClient>;

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  /**
   * Mark an AI processing job as started
   */
  async markAIJobAsProcessing(projectId: string, step: string): Promise<void> {
    const { error } = await (this.supabase as any).rpc('fn_mark_ai_job_processing', {
      p_project_id: projectId,
      p_step: step
    });

    if (error) {
      throw new Error(`Failed to mark AI job as processing: ${error.message}`);
    }
  }

  /**
   * Mark an AI processing job as completed
   */
  async markAIJobAsCompleted(
    projectId: string,
    step: string,
    processingDurationMs?: number
  ): Promise<void> {
    const { error } = await (this.supabase as any).rpc('fn_mark_ai_job_completed', {
      p_project_id: projectId,
      p_step: step,
      p_processing_duration_ms: processingDurationMs
    });

    if (error) {
      throw new Error(`Failed to mark AI job as completed: ${error.message}`);
    }
  }

  /**
   * Mark an AI processing job as failed
   */
  async markAIJobAsFailed(
    projectId: string,
    step: string,
    errorMessage: string,
    errorDetails?: any
  ): Promise<void> {
    const { error } = await (this.supabase as any).rpc('fn_mark_ai_job_failed', {
      p_project_id: projectId,
      p_step: step,
      p_error_message: errorMessage,
      p_error_details: errorDetails ? JSON.stringify(errorDetails) : null
    });

    if (error) {
      throw new Error(`Failed to mark AI job as failed: ${error.message}`);
    }
  }

  /**
   * Update job heartbeat to indicate it's still alive
   */
  async updateJobHeartbeat(jobType: JobType, jobId: string): Promise<void> {
    const { error } = await (this.supabase as any).rpc('fn_update_job_heartbeat', {
      p_job_type: jobType,
      p_job_id: jobId
    });

    if (error) {
      throw new Error(`Failed to update job heartbeat: ${error.message}`);
    }
  }

  /**
   * Log a job event for audit and monitoring
   */
  async logJobEvent(params: {
    projectId?: string;
    ingestionId?: string;
    jobType: JobType;
    jobId: string;
    eventType: JobEventType;
    previousStatus?: string;
    newStatus?: string;
    errorDetails?: any;
    processingDurationMs?: number;
    metadata?: any;
  }): Promise<string> {
    const { data, error } = await (this.supabase as any).rpc('fn_log_job_event', {
      p_project_id: params.projectId || null,
      p_ingestion_id: params.ingestionId || null,
      p_job_type: params.jobType,
      p_job_id: params.jobId,
      p_event_type: params.eventType,
      p_previous_status: params.previousStatus || null,
      p_new_status: params.newStatus || null,
      p_error_details: params.errorDetails ? JSON.stringify(params.errorDetails) : null,
      p_processing_duration_ms: params.processingDurationMs || null,
      p_metadata: params.metadata ? JSON.stringify(params.metadata) : '{}'
    });

    if (error) {
      throw new Error(`Failed to log job event: ${error.message}`);
    }

    return data;
  }

  /**
   * Get all processing jobs with filtering options
   */
  async getProcessingJobs(filters?: {
    jobType?: JobType;
    status?: JobStatus;
    projectId?: string;
    ingestionId?: string;
    stuckOnly?: boolean;
    limit?: number;
  }): Promise<ProcessingJob[]> {
    let query = (this.supabase as any)
      .from('v_processing_jobs')
      .select('*')
      .order('created_at', { ascending: false });

    if (filters) {
      if (filters.jobType) {
        query = query.eq('job_type', filters.jobType);
      }
      if (filters.status) {
        query = query.eq('status', filters.status);
      }
      if (filters.projectId) {
        query = query.eq('project_id', filters.projectId);
      }
      if (filters.ingestionId) {
        query = query.eq('ingestion_id', filters.ingestionId);
      }
      if (filters.stuckOnly) {
        query = query.eq('is_stuck', true);
      }
      if (filters.limit) {
        query = query.limit(filters.limit);
      }
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch processing jobs: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Get job statistics for monitoring dashboard
   */
  async getJobStatistics(hoursBack: number = 24): Promise<JobStatistics> {
    const { data, error } = await (this.supabase as any).rpc('fn_get_job_statistics', {
      p_hours_back: hoursBack
    });

    if (error) {
      throw new Error(`Failed to get job statistics: ${error.message}`);
    }

    return data;
  }

  /**
   * Recover stuck jobs automatically
   */
  async recoverStuckJobs(): Promise<JobRecoveryResult> {
    const { data, error } = await (this.supabase as any).rpc('fn_recover_stuck_jobs');

    if (error) {
      throw new Error(`Failed to recover stuck jobs: ${error.message}`);
    }

    return data;
  }

  /**
   * Manually retry a specific job
   */
  async retryJob(jobType: JobType, jobId: string): Promise<void> {
    if (jobType === 'ai_processing') {
      // Get the job details first
      const { data: job, error: jobError } = await (this.supabase as any)
        .from('ai_processing_status')
        .select('project_id, step, retry_count, max_retries')
        .eq('id', jobId)
        .single();

      if (jobError) {
        throw new Error(`Failed to fetch AI job: ${jobError.message}`);
      }

      if ((job as any).retry_count >= (job as any).max_retries) {
        throw new Error(`Job has reached maximum retry limit (${(job as any).max_retries})`);
      }

      // Reset the job
      const { error } = await (this.supabase as any)
        .from('ai_processing_status')
        .update({
          status: 'pending',
          started_at: null,
          finished_at: null,
          last_retry_at: new Date().toISOString()
        })
        .eq('id', jobId);

      if (error) {
        throw new Error(`Failed to retry AI job: ${error.message}`);
      }

      // Log the retry event
      await this.logJobEvent({
        projectId: (job as any).project_id,
        jobType: 'ai_processing',
        jobId,
        eventType: 'retried',
        previousStatus: 'failed',
        newStatus: 'pending',
        metadata: { manual_retry: true }
      });

    } else if (jobType === 'ingestion') {
      // Get the job details first
      const { data: job, error: jobError } = await (this.supabase as any)
        .from('ingestion_steps')
        .select('ingestion_id, attempt, max_retries')
        .eq('id', jobId)
        .single();

      if (jobError) {
        throw new Error(`Failed to fetch ingestion job: ${jobError.message}`);
      }

      if ((job as any).attempt >= (job as any).max_retries) {
        throw new Error(`Job has reached maximum retry limit (${(job as any).max_retries})`);
      }

      // Reset the job
      const { error } = await (this.supabase as any)
        .from('ingestion_steps')
        .update({
          status: 'queued',
          started_at: null,
          finished_at: null,
          last_retry_at: new Date().toISOString()
        })
        .eq('id', jobId);

      if (error) {
        throw new Error(`Failed to retry ingestion job: ${error.message}`);
      }

      // Log the retry event
      await this.logJobEvent({
        ingestionId: (job as any).ingestion_id,
        jobType: 'ingestion',
        jobId,
        eventType: 'retried',
        previousStatus: 'failed',
        newStatus: 'queued',
        metadata: { manual_retry: true }
      });
    }
  }

  /**
   * Cancel a running job
   */
  async cancelJob(jobType: JobType, jobId: string): Promise<void> {
    const table = jobType === 'ai_processing' ? 'ai_processing_status' : 'ingestion_steps';
    const statusField = jobType === 'ai_processing' ? 'status' : 'status';

    const { error } = await (this.supabase as any)
      .from(table)
      .update({
        [statusField]: 'failed',
        finished_at: new Date().toISOString(),
        error_message: 'Job cancelled by user'
      })
      .eq('id', jobId);

    if (error) {
      throw new Error(`Failed to cancel job: ${error.message}`);
    }

    // Log the cancellation event
    await this.logJobEvent({
      jobType,
      jobId,
      eventType: 'cancelled',
      previousStatus: 'running',
      newStatus: 'failed',
      metadata: { manual_cancellation: true }
    });
  }

  /**
   * Get job events for debugging and audit
   */
  async getJobEvents(filters?: {
    jobType?: JobType;
    jobId?: string;
    projectId?: string;
    ingestionId?: string;
    eventType?: JobEventType;
    limit?: number;
    hoursBack?: number;
  }): Promise<any[]> {
    let query = (this.supabase as any)
      .from('job_events')
      .select('*')
      .order('created_at', { ascending: false });

    if (filters) {
      if (filters.jobType) {
        query = query.eq('job_type', filters.jobType);
      }
      if (filters.jobId) {
        query = query.eq('job_id', filters.jobId);
      }
      if (filters.projectId) {
        query = query.eq('project_id', filters.projectId);
      }
      if (filters.ingestionId) {
        query = query.eq('ingestion_id', filters.ingestionId);
      }
      if (filters.eventType) {
        query = query.eq('event_type', filters.eventType);
      }
      if (filters.hoursBack) {
        const since = new Date(Date.now() - filters.hoursBack * 60 * 60 * 1000).toISOString();
        query = query.gte('created_at', since);
      }
      if (filters.limit) {
        query = query.limit(filters.limit);
      }
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch job events: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Get health check for the job system
   */
  async getSystemHealth(): Promise<{
    healthy: boolean;
    issues: string[];
    metrics: {
      stuck_jobs: number;
      failed_jobs_last_hour: number;
      avg_processing_time_ms: number;
      total_active_jobs: number;
    };
  }> {
    const stats = await this.getJobStatistics(1); // Last hour
    const stuckJobs = await this.getProcessingJobs({ stuckOnly: true });

    const issues: string[] = [];
    const metrics = {
      stuck_jobs: stuckJobs.length,
      failed_jobs_last_hour: stats.overall.failed_count,
      avg_processing_time_ms: stats.overall.avg_processing_time_ms || 0,
      total_active_jobs: stats.overall.queued_count + stats.overall.processing_count
    };

    // Check for issues
    if (metrics.stuck_jobs > 0) {
      issues.push(`${metrics.stuck_jobs} stuck jobs detected`);
    }

    if (metrics.failed_jobs_last_hour > 10) {
      issues.push(`High failure rate: ${metrics.failed_jobs_last_hour} failures in last hour`);
    }

    if (metrics.avg_processing_time_ms > 30 * 60 * 1000) { // 30 minutes
      issues.push(`Slow processing detected: avg ${Math.round(metrics.avg_processing_time_ms / 1000 / 60)} minutes`);
    }

    if (metrics.total_active_jobs > 100) {
      issues.push(`High job queue: ${metrics.total_active_jobs} active jobs`);
    }

    return {
      healthy: issues.length === 0,
      issues,
      metrics
    };
  }
}

// Create a singleton instance for server-side usage
export function createJobManager(): JobManager {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase configuration for JobManager');
  }

  return new JobManager(supabaseUrl, supabaseKey);
}

