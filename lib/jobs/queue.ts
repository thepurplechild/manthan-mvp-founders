/**
 * Job Queue Management using Vercel KV
 *
 * This module handles job queuing, status tracking, and queue operations
 * using Vercel's KV store for reliable job processing.
 */

import { kv } from '@vercel/kv';
import { createId } from '@paralleldrive/cuid2';
import {
  JobMetadata,
  QueueJob,
  IngestionStats,
  DeadLetterJob,
  KV_KEYS,
  JOB_PRIORITIES,
  MAX_RETRY_ATTEMPTS,
  RETRY_DELAY_BASE
} from './types';

/**
 * Generate a unique job ID
 */
export function generateJobId(): string {
  return `job_${createId()}`;
}

/**
 * Add a job to the processing queue
 */
export async function enqueueJob(jobMetadata: JobMetadata): Promise<void> {
  const queueJob: QueueJob = {
    jobId: jobMetadata.jobId,
    priority: JOB_PRIORITIES[jobMetadata.options.priority],
    createdAt: jobMetadata.createdAt,
    retryCount: 0
  };

  // Add to sorted set with priority as score (lower score = higher priority)
  await kv.zadd(KV_KEYS.QUEUE, {
    score: queueJob.priority,
    member: JSON.stringify(queueJob)
  });

  // Store job metadata
  await kv.hset(KV_KEYS.JOB_STATUS(jobMetadata.jobId), jobMetadata as unknown as Record<string, unknown>);

  console.log(`[queue] Job ${jobMetadata.jobId} enqueued with priority ${jobMetadata.options.priority}`);
}

/**
 * Get the next job from the queue
 */
export async function dequeueJob(): Promise<QueueJob | null> {
  // Get the highest priority job (lowest score)
  const result = await kv.zrange(KV_KEYS.QUEUE, 0, 0, { withScores: true });

  if (!result || result.length === 0) {
    return null;
  }

  const jobData = result[0] as string;
  const job: QueueJob = JSON.parse(jobData);

  // Remove from queue
  await kv.zrem(KV_KEYS.QUEUE, jobData);

  console.log(`[queue] Dequeued job ${job.jobId} (priority: ${job.priority})`);
  return job;
}


/**
 * Update job status and metadata
 */
export async function updateJobStatus(
  jobId: string,
  updates: Partial<JobMetadata>
): Promise<void> {
  const existing = await getJobMetadata(jobId);
  if (!existing) {
    throw new Error(`Job ${jobId} not found`);
  }

  const updated: JobMetadata = {
    ...existing,
    ...updates,
    progress: {
      ...existing.progress,
      ...updates.progress
    }
  };

  await kv.hset(KV_KEYS.JOB_STATUS(jobId), updated as unknown as Record<string, unknown>);

  console.log(`[queue] Updated job ${jobId} status to ${updated.status}`);
}

/**
 * Mark job as processing
 */
export async function startJobProcessing(jobId: string): Promise<void> {
  await updateJobStatus(jobId, {
    status: 'processing',
    startedAt: new Date().toISOString(),
    progress: {
      currentStep: 'Starting processing',
      percentage: 0,
      details: 'Initializing job processing'
    }
  });
}

/**
 * Mark job as completed
 */
export async function completeJob(
  jobId: string,
  result: JobMetadata['result']
): Promise<void> {
  await updateJobStatus(jobId, {
    status: 'completed',
    completedAt: new Date().toISOString(),
    progress: {
      currentStep: 'Completed',
      percentage: 100,
      details: 'Processing completed successfully'
    },
    result
  });
}

/**
 * Mark job as failed
 */
export async function failJob(
  jobId: string,
  error: {
    type: string;
    message: string;
    stackTrace?: string;
    retryable: boolean;
  }
): Promise<void> {
  const existing = await getJobMetadata(jobId);
  const retryCount = (existing?.error?.retryCount || 0) + 1;

  const shouldRetry = error.retryable && retryCount <= MAX_RETRY_ATTEMPTS;

  if (shouldRetry) {
    // Re-queue for retry with exponential backoff
    const retryDelay = RETRY_DELAY_BASE * Math.pow(2, retryCount - 1);
    const retryAt = new Date(Date.now() + retryDelay * 1000);

    await updateJobStatus(jobId, {
      status: 'retrying',
      error: {
        ...error,
        retryCount,
        lastRetryAt: new Date().toISOString()
      },
      progress: {
        currentStep: 'Retrying',
        percentage: 0,
        details: `Retry ${retryCount}/${MAX_RETRY_ATTEMPTS} scheduled for ${retryAt.toLocaleTimeString()}`
      }
    });

    // Re-queue the job for retry
    if (existing) {
      const queueJob: QueueJob = {
        jobId,
        priority: JOB_PRIORITIES[existing.options.priority],
        createdAt: existing.createdAt,
        retryCount
      };

      // Add back to queue with slight delay score
      await kv.zadd(KV_KEYS.QUEUE, {
        score: queueJob.priority + (retryCount * 0.1), // Slight penalty for retries
        member: JSON.stringify(queueJob)
      });
    }

    console.log(`[queue] Job ${jobId} scheduled for retry ${retryCount}/${MAX_RETRY_ATTEMPTS}`);
  } else {
    // Mark as permanently failed
    await updateJobStatus(jobId, {
      status: 'failed',
      completedAt: new Date().toISOString(),
      error: {
        ...error,
        retryCount
      },
      progress: {
        currentStep: 'Failed',
        percentage: 0,
        details: shouldRetry ? 'Maximum retries exceeded' : 'Processing failed'
      }
    });

    console.log(`[queue] Job ${jobId} marked as failed after ${retryCount} attempts`);
  }
}

/**
 * Get queue statistics
 */
export async function getQueueStats(): Promise<IngestionStats> {
  const queueLength = await kv.zcard(KV_KEYS.QUEUE);

  // This is a simplified version - in production you'd maintain counters
  const existingStats = await kv.hgetall(KV_KEYS.STATS) as IngestionStats | null;

  return {
    totalJobs: existingStats?.totalJobs || 0,
    completedJobs: existingStats?.completedJobs || 0,
    failedJobs: existingStats?.failedJobs || 0,
    pendingJobs: queueLength || 0,
    lastProcessedAt: existingStats?.lastProcessedAt || new Date().toISOString()
  };
}

/**
 * Update processing statistics
 */
export async function updateStats(updates: Partial<IngestionStats>): Promise<void> {
  const existing = await getQueueStats();
  const updated = {
    ...existing,
    ...updates,
    lastProcessedAt: new Date().toISOString()
  };

  await kv.hset(KV_KEYS.STATS, updated);
}


/**
 * Acquire processing lock to prevent concurrent processing
 */
export async function acquireProcessingLock(ttlSeconds: number = 300): Promise<boolean> {
  const lockKey = KV_KEYS.PROCESSING_LOCK;
  const lockValue = `lock_${Date.now()}_${createId()}`;

  // Try to set lock with TTL
  const result = await kv.set(lockKey, lockValue, {
    ex: ttlSeconds,
    nx: true // Only set if key doesn't exist
  });

  return result === 'OK';
}

/**
 * Release processing lock
 */
export async function releaseProcessingLock(): Promise<void> {
  await kv.del(KV_KEYS.PROCESSING_LOCK);
}

/**
 * Calculate exponential backoff delay for retry
 */
export function calculateRetryDelay(retryCount: number): number {
  const baseDelaySeconds = RETRY_DELAY_BASE;
  const maxDelaySeconds = 3600; // 1 hour max
  const jitterFactor = 0.1; // Add 10% jitter to prevent thundering herd

  const exponentialDelay = baseDelaySeconds * Math.pow(2, retryCount);
  const cappedDelay = Math.min(exponentialDelay, maxDelaySeconds);
  const jitter = cappedDelay * jitterFactor * Math.random();

  return cappedDelay + jitter;
}

/**
 * Move job to dead letter queue
 */
export async function moveToDeadLetterQueue(
  jobMetadata: JobMetadata,
  processingHistory: Array<{
    attemptNumber: number;
    failedAt: string;
    error: string;
    processingTimeMs?: number;
  }>
): Promise<void> {
  const deadLetterJob: DeadLetterJob = {
    originalJob: jobMetadata,
    failureInfo: {
      totalRetries: jobMetadata.error?.retryCount || 0,
      lastError: jobMetadata.error?.message || 'Unknown error',
      failedAt: new Date().toISOString(),
      processingHistory
    },
    debugInfo: {
      memoryUsage: process.memoryUsage(),
      nodeVersion: process.version,
      vercelRegion: process.env.VERCEL_REGION || 'unknown'
    }
  };

  // Add to dead letter queue
  await kv.lpush(KV_KEYS.DEAD_LETTER_QUEUE, JSON.stringify(deadLetterJob));

  // Update job status to dead_letter
  const updatedJob: JobMetadata = {
    ...jobMetadata,
    status: 'dead_letter',
    completedAt: new Date().toISOString()
  };

  await kv.hset(KV_KEYS.JOB_STATUS(jobMetadata.jobId), updatedJob as unknown as Record<string, unknown>);

  console.log(`[queue] Moved job ${jobMetadata.jobId} to dead letter queue after ${deadLetterJob.failureInfo.totalRetries} retries`);
}

/**
 * Get dead letter jobs with pagination
 */
export async function getDeadLetterJobs(
  page: number = 1,
  pageSize: number = 50
): Promise<{ jobs: DeadLetterJob[]; totalCount: number }> {
  const start = (page - 1) * pageSize;
  const end = start + pageSize - 1;

  // Get paginated dead letter jobs
  const jobsData = await kv.lrange(KV_KEYS.DEAD_LETTER_QUEUE, start, end);
  const jobs = jobsData.map(data => JSON.parse(data) as DeadLetterJob);

  // Get total count
  const totalCount = await kv.llen(KV_KEYS.DEAD_LETTER_QUEUE);

  return { jobs, totalCount };
}

/**
 * Retry job with exponential backoff
 */
export async function scheduleJobRetry(
  jobMetadata: JobMetadata,
  error: string,
  processingTimeMs?: number
): Promise<boolean> {
  const currentRetryCount = (jobMetadata.error?.retryCount || 0) + 1;

  // Check if we've exceeded max retries
  if (currentRetryCount > MAX_RETRY_ATTEMPTS) {
    // Add to processing history for dead letter queue
    const processingHistory = [
      {
        attemptNumber: currentRetryCount,
        failedAt: new Date().toISOString(),
        error,
        processingTimeMs
      }
    ];

    await moveToDeadLetterQueue(jobMetadata, processingHistory);
    return false;
  }

  // Calculate retry delay
  const retryDelaySeconds = calculateRetryDelay(currentRetryCount - 1);
  const retryAt = new Date(Date.now() + (retryDelaySeconds * 1000));

  // Update job metadata with retry info
  const updatedJob: JobMetadata = {
    ...jobMetadata,
    status: 'retrying',
    error: {
      type: jobMetadata.error?.type || 'processing_error',
      message: error,
      retryable: true,
      retryCount: currentRetryCount,
      lastRetryAt: new Date().toISOString()
    }
  };

  // Store updated job metadata
  await kv.hset(KV_KEYS.JOB_STATUS(jobMetadata.jobId), updatedJob as unknown as Record<string, unknown>);

  // Re-queue the job with delayed execution
  const queueJob: QueueJob = {
    jobId: jobMetadata.jobId,
    priority: JOB_PRIORITIES[jobMetadata.options.priority],
    createdAt: retryAt.toISOString(),
    retryCount: currentRetryCount
  };

  // Use timestamp as score for delayed processing
  await kv.zadd(KV_KEYS.QUEUE, {
    score: retryAt.getTime(),
    member: JSON.stringify(queueJob)
  });

  console.log(`[queue] Scheduled job ${jobMetadata.jobId} for retry #${currentRetryCount} in ${Math.round(retryDelaySeconds)} seconds`);
  return true;
}

/**
 * Clean up old completed jobs and associated blob storage
 */
export async function cleanupOldJobs(olderThanDays: number = 7): Promise<{
  cleanedJobs: number;
  cleanedBlobs: number;
  errors: string[];
}> {
  const cutoffTime = Date.now() - (olderThanDays * 24 * 60 * 60 * 1000);
  const errors: string[] = [];
  let cleanedJobs = 0;
  let cleanedBlobs = 0;

  try {
    // Get all job keys
    const jobKeys = await kv.keys('ingestion:job:*');

    for (const jobKey of jobKeys) {
      try {
        const jobData = await kv.hgetall(jobKey) as Record<string, string>;
        if (!jobData || !jobData.completedAt) continue;

        const completedAt = new Date(jobData.completedAt).getTime();
        if (completedAt > cutoffTime) continue;

        // Only clean up completed or failed jobs, not dead letter ones
        if (jobData.status === 'completed' || jobData.status === 'failed') {
          // Clean up blob storage if exists
          if (jobData.file) {
            try {
              const fileData = JSON.parse(jobData.file);
              if (fileData.blobUrl) {
                await fetch(fileData.blobUrl, { method: 'DELETE' });
                cleanedBlobs++;
              }
            } catch (blobError) {
              errors.push(`Failed to clean blob for job ${jobKey}: ${blobError}`);
            }
          }

          // Remove job metadata
          await kv.del(jobKey);
          cleanedJobs++;
        }
      } catch (jobError) {
        errors.push(`Failed to process job ${jobKey}: ${jobError}`);
      }
    }

    console.log(`[cleanup] Cleaned up ${cleanedJobs} old jobs and ${cleanedBlobs} blobs`);
    return { cleanedJobs, cleanedBlobs, errors };

  } catch (error) {
    const errorMessage = `Cleanup failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
    console.error(`[cleanup] ${errorMessage}`);
    errors.push(errorMessage);
    return { cleanedJobs, cleanedBlobs, errors };
  }
}

/**
 * Acquire cleanup lock to prevent concurrent cleanup operations
 */
export async function acquireCleanupLock(timeoutMs: number = 300000): Promise<boolean> {
  const lockKey = KV_KEYS.CLEANUP_LOCK;
  const lockValue = `cleanup_${Date.now()}`;
  const expireTime = Math.floor(timeoutMs / 1000);

  const result = await kv.set(lockKey, lockValue, {
    px: timeoutMs,
    nx: true
  });

  return result === 'OK';
}

/**
 * Release cleanup lock
 */
export async function releaseCleanupLock(): Promise<void> {
  await kv.del(KV_KEYS.CLEANUP_LOCK);
}

/**
 * Get job metadata by job ID
 */
export async function getJobMetadata(jobId: string): Promise<JobMetadata | null> {
  try {
    const jobData = await kv.hgetall(KV_KEYS.JOB_STATUS(jobId)) as Record<string, string>;

    if (!jobData || Object.keys(jobData).length === 0) {
      return null;
    }

    // Parse the job metadata from KV storage
    const metadata: JobMetadata = {
      jobId: jobData.jobId,
      status: jobData.status as JobMetadata['status'],
      file: JSON.parse(jobData.file || '{}'),
      options: JSON.parse(jobData.options || '{}'),
      createdAt: jobData.createdAt,
      startedAt: jobData.startedAt,
      completedAt: jobData.completedAt,
      progress: JSON.parse(jobData.progress || '{}'),
      error: jobData.error ? JSON.parse(jobData.error) : undefined,
      result: jobData.result ? JSON.parse(jobData.result) : undefined
    };

    return metadata;

  } catch (error) {
    console.error(`[queue] Failed to get job metadata for ${jobId}:`, error);
    return null;
  }
}