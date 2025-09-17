/**
 * Job Metrics and Monitoring System
 *
 * This module handles job metrics collection, health monitoring,
 * and structured logging for the async ingestion system.
 */

import { kv } from '@vercel/kv';
import {
  JobMetrics,
  JobMetadata,
  DeadLetterJob,
  KV_KEYS,
  HealthCheckResponse
} from './types';

/**
 * Structured logger for job processing
 */
export class JobLogger {
  private static instance: JobLogger;
  private sessionId: string;
  private startTime: number;

  private constructor() {
    this.sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.startTime = Date.now();
  }

  static getInstance(): JobLogger {
    if (!JobLogger.instance) {
      JobLogger.instance = new JobLogger();
    }
    return JobLogger.instance;
  }

  private formatLog(level: string, category: string, message: string, data?: Record<string, unknown>) {
    return {
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      sessionId: this.sessionId,
      uptime: Date.now() - this.startTime,
      memoryUsage: {
        heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
      },
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        vercelRegion: process.env.VERCEL_REGION || 'unknown'
      },
      ...data
    };
  }

  info(category: string, message: string, data?: Record<string, unknown>) {
    console.log(JSON.stringify(this.formatLog('INFO', category, message, data)));
  }

  warn(category: string, message: string, data?: Record<string, unknown>) {
    console.warn(JSON.stringify(this.formatLog('WARN', category, message, data)));
  }

  error(category: string, message: string, error?: Error, data?: Record<string, unknown>) {
    const errorData = error ? {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack
      }
    } : {};

    console.error(JSON.stringify(this.formatLog('ERROR', category, message, { ...errorData, ...data })));
  }

  metric(category: string, metricName: string, value: number, unit?: string, data?: Record<string, unknown>) {
    console.log(JSON.stringify(this.formatLog('METRIC', category, metricName, {
      metricValue: value,
      metricUnit: unit || 'count',
      ...data
    })));
  }

  jobStart(jobId: string, jobData: Partial<JobMetadata>) {
    this.info('JOB_START', `Starting job ${jobId}`, {
      jobId,
      fileName: jobData.file?.name,
      fileSize: jobData.file?.size,
      priority: jobData.options?.priority
    });
  }

  jobComplete(jobId: string, processingTimeMs: number, result: unknown) {
    this.info('JOB_COMPLETE', `Job ${jobId} completed successfully`, {
      jobId,
      processingTimeMs,
      processingTimeSeconds: Math.round(processingTimeMs / 1000 * 100) / 100,
      resultType: (result as JobMetadata['result'])?.contentType || 'unknown'
    });

    this.metric('JOB_PROCESSING', 'processing_time_ms', processingTimeMs, 'milliseconds', { jobId });
    this.metric('JOB_PROCESSING', 'success_count', 1, 'count', { jobId });
  }

  jobFailed(jobId: string, error: string, processingTimeMs: number, retryCount: number) {
    this.error('JOB_FAILED', `Job ${jobId} failed`, new Error(error), {
      jobId,
      processingTimeMs,
      retryCount,
      willRetry: retryCount < 3
    });

    this.metric('JOB_PROCESSING', 'failure_count', 1, 'count', { jobId, errorType: error });
    this.metric('JOB_PROCESSING', 'retry_count', retryCount, 'count', { jobId });
  }

  jobDeadLetter(jobId: string, totalRetries: number, finalError: string) {
    this.error('JOB_DEAD_LETTER', `Job ${jobId} moved to dead letter queue`, new Error(finalError), {
      jobId,
      totalRetries,
      finalError
    });

    this.metric('JOB_PROCESSING', 'dead_letter_count', 1, 'count', { jobId });
  }
}

/**
 * Collect and update job metrics
 */
export async function updateJobMetrics(
  jobResult: {
    success: boolean;
    processingTimeMs: number;
    errorType?: string;
  }
): Promise<void> {
  try {
    // Get current metrics
    const currentMetrics = await getJobMetrics();

    // Update metrics
    const updatedMetrics: JobMetrics = {
      ...currentMetrics,
      totalJobs: currentMetrics.totalJobs + 1,
      successfulJobs: jobResult.success ? currentMetrics.successfulJobs + 1 : currentMetrics.successfulJobs,
      failedJobs: !jobResult.success ? currentMetrics.failedJobs + 1 : currentMetrics.failedJobs,
      lastProcessedAt: new Date().toISOString(),

      // Update processing time metrics
      averageProcessingTime: calculateNewAverage(
        currentMetrics.averageProcessingTime,
        currentMetrics.totalJobs,
        jobResult.processingTimeMs
      )
    };

    // Update error patterns if job failed
    if (!jobResult.success && jobResult.errorType) {
      updatedMetrics.commonErrors = updateErrorPatterns(
        currentMetrics.commonErrors,
        jobResult.errorType
      );
    }

    // Store updated metrics
    await kv.hset(KV_KEYS.METRICS, updatedMetrics as unknown as Record<string, unknown>);

  } catch (error) {
    JobLogger.getInstance().error('METRICS', 'Failed to update job metrics', error as Error);
  }
}

/**
 * Get current job metrics
 */
export async function getJobMetrics(): Promise<JobMetrics> {
  try {
    const metricsData = await kv.hgetall(KV_KEYS.METRICS) as Record<string, string>;

    if (!metricsData || Object.keys(metricsData).length === 0) {
      // Return default metrics if none exist
      return {
        totalJobs: 0,
        successfulJobs: 0,
        failedJobs: 0,
        retriedJobs: 0,
        deadLetterJobs: 0,
        averageProcessingTime: 0,
        medianProcessingTime: 0,
        p95ProcessingTime: 0,
        currentQueueSize: 0,
        oldestJobAge: 0,
        commonErrors: [],
        lastProcessedAt: new Date().toISOString(),
        systemHealth: 'healthy',
        uptime: 0
      };
    }

    // Parse and return metrics
    return {
      totalJobs: parseInt(metricsData.totalJobs) || 0,
      successfulJobs: parseInt(metricsData.successfulJobs) || 0,
      failedJobs: parseInt(metricsData.failedJobs) || 0,
      retriedJobs: parseInt(metricsData.retriedJobs) || 0,
      deadLetterJobs: parseInt(metricsData.deadLetterJobs) || 0,
      averageProcessingTime: parseFloat(metricsData.averageProcessingTime) || 0,
      medianProcessingTime: parseFloat(metricsData.medianProcessingTime) || 0,
      p95ProcessingTime: parseFloat(metricsData.p95ProcessingTime) || 0,
      currentQueueSize: parseInt(metricsData.currentQueueSize) || 0,
      oldestJobAge: parseInt(metricsData.oldestJobAge) || 0,
      commonErrors: metricsData.commonErrors ? JSON.parse(metricsData.commonErrors) : [],
      lastProcessedAt: metricsData.lastProcessedAt || new Date().toISOString(),
      systemHealth: (metricsData.systemHealth as 'healthy' | 'degraded' | 'unhealthy') || 'healthy',
      uptime: parseInt(metricsData.uptime) || 0
    };

  } catch (error) {
    JobLogger.getInstance().error('METRICS', 'Failed to get job metrics', error as Error);
    throw error;
  }
}

/**
 * Perform comprehensive health check
 */
export async function performHealthCheck(): Promise<HealthCheckResponse> {
  const logger = JobLogger.getInstance();
  const startTime = Date.now();
  const alerts: HealthCheckResponse['alerts'] = [];

  try {
    logger.info('HEALTH_CHECK', 'Starting comprehensive health check');

    // Test KV connection
    const kvConnection = await testKvConnection();
    if (!kvConnection) {
      alerts.push({
        level: 'critical',
        message: 'KV store is not accessible',
        component: 'vercel-kv',
        timestamp: new Date().toISOString()
      });
    }

    // Test Blob access
    const blobAccess = await testBlobAccess();
    if (!blobAccess) {
      alerts.push({
        level: 'error',
        message: 'Blob storage is not accessible',
        component: 'vercel-blob',
        timestamp: new Date().toISOString()
      });
    }

    // Get current metrics
    const metrics = await getJobMetrics();

    // Check queue processing health
    const queueProcessing = await checkQueueHealth(metrics);
    const cronJobActive = await checkCronJobHealth(metrics);

    if (!queueProcessing) {
      alerts.push({
        level: 'warning',
        message: 'Queue processing appears to be stalled',
        component: 'queue-processor',
        timestamp: new Date().toISOString()
      });
    }

    if (!cronJobActive) {
      alerts.push({
        level: 'error',
        message: 'Cron job has not processed jobs recently',
        component: 'cron-job',
        timestamp: new Date().toISOString()
      });
    }

    // Determine overall health status
    let status: HealthCheckResponse['status'] = 'healthy';
    if (alerts.some(a => a.level === 'critical')) {
      status = 'unhealthy';
    } else if (alerts.some(a => a.level === 'error') || alerts.length > 2) {
      status = 'degraded';
    }

    const healthCheckTime = Date.now() - startTime;
    logger.info('HEALTH_CHECK', 'Health check completed', {
      status,
      alertCount: alerts.length,
      healthCheckTimeMs: healthCheckTime
    });

    return {
      status,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      metrics,
      checks: {
        kvConnection,
        blobAccess,
        queueProcessing,
        cronJobActive
      },
      alerts: alerts.length > 0 ? alerts : undefined
    };

  } catch (error) {
    logger.error('HEALTH_CHECK', 'Health check failed', error as Error);

    return {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      metrics: await getJobMetrics().catch(() => ({
        totalJobs: 0,
        successfulJobs: 0,
        failedJobs: 0,
        retriedJobs: 0,
        deadLetterJobs: 0,
        averageProcessingTime: 0,
        medianProcessingTime: 0,
        p95ProcessingTime: 0,
        currentQueueSize: 0,
        oldestJobAge: 0,
        commonErrors: [],
        lastProcessedAt: new Date().toISOString(),
        systemHealth: 'unhealthy',
        uptime: 0
      })),
      checks: {
        kvConnection: false,
        blobAccess: false,
        queueProcessing: false,
        cronJobActive: false
      },
      alerts: [{
        level: 'critical',
        message: `Health check system failure: ${error instanceof Error ? error.message : 'Unknown error'}`,
        component: 'health-check',
        timestamp: new Date().toISOString()
      }]
    };
  }
}

// Helper functions

function calculateNewAverage(currentAverage: number, totalCount: number, newValue: number): number {
  return ((currentAverage * totalCount) + newValue) / (totalCount + 1);
}

function updateErrorPatterns(
  currentErrors: Array<{ errorType: string; count: number; lastSeen: string }>,
  newErrorType: string
): Array<{ errorType: string; count: number; lastSeen: string }> {
  const existing = currentErrors.find(e => e.errorType === newErrorType);

  if (existing) {
    existing.count++;
    existing.lastSeen = new Date().toISOString();
    return currentErrors;
  } else {
    return [...currentErrors, {
      errorType: newErrorType,
      count: 1,
      lastSeen: new Date().toISOString()
    }].slice(-10); // Keep only the 10 most recent error types
  }
}

async function testKvConnection(): Promise<boolean> {
  try {
    await kv.set('health-check-test', Date.now(), { px: 10000 });
    await kv.del('health-check-test');
    return true;
  } catch {
    return false;
  }
}

async function testBlobAccess(): Promise<boolean> {
  try {
    // Test if we can access Vercel Blob API
    const response = await fetch('https://api.vercel.com/v1/storage/blob', {
      method: 'HEAD',
      headers: {
        'Authorization': `Bearer ${process.env.BLOB_READ_WRITE_TOKEN || ''}`,
      }
    });
    return response.ok || response.status === 404; // 404 is fine, means API is accessible
  } catch {
    return false;
  }
}

async function checkQueueHealth(metrics: JobMetrics): Promise<boolean> {
  // Check if jobs have been processed recently
  const lastProcessed = new Date(metrics.lastProcessedAt);
  const timeSinceLastProcess = Date.now() - lastProcessed.getTime();

  // Consider unhealthy if no jobs processed in last 10 minutes AND there are jobs in queue
  return timeSinceLastProcess < 600000 || metrics.currentQueueSize === 0;
}

async function checkCronJobHealth(metrics: JobMetrics): Promise<boolean> {
  // Check if the cron job is running by looking at recent processing
  const lastProcessed = new Date(metrics.lastProcessedAt);
  const timeSinceLastProcess = Date.now() - lastProcessed.getTime();

  // Consider unhealthy if no activity in last 5 minutes
  return timeSinceLastProcess < 300000;
}