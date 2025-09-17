/**
 * Vercel Cron Job: Process Ingestion Queue
 *
 * This endpoint is called by Vercel Cron to process queued file ingestion jobs.
 * It runs every minute and processes pending jobs from the KV queue.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  dequeueJob,
  acquireProcessingLock,
  releaseProcessingLock,
  getQueueStats,
  updateStats,
  scheduleJobRetry,
  cleanupOldJobs,
  acquireCleanupLock,
  releaseCleanupLock
} from '@/lib/jobs/queue';
import { processJobBatch } from '@/lib/jobs/processor';
import { JobLogger, updateJobMetrics } from '@/lib/jobs/metrics';
import { QUEUE_BATCH_SIZE, JobMetadata } from '@/lib/jobs/types';

/**
 * Verify the request is from Vercel Cron
 */
function verifyVercelCron(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  // In production, always verify the cron secret
  if (process.env.NODE_ENV === 'production') {
    if (!cronSecret) {
      console.error('[cron] CRON_SECRET not configured in production');
      return false;
    }

    if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
      console.error('[cron] Invalid or missing authorization header');
      return false;
    }
  }

  // Additional verification: check if request is from Vercel
  const userAgent = request.headers.get('user-agent');
  const isFromVercel = userAgent?.includes('vercel-cron') ||
                      userAgent?.includes('vercel') ||
                      request.headers.get('x-vercel-cron') === '1';

  if (process.env.NODE_ENV === 'production' && !isFromVercel) {
    console.warn('[cron] Request may not be from Vercel cron');
    return false;
  }

  return true;
}

const logger = JobLogger.getInstance();

/**
 * Enhanced process jobs cron handler with comprehensive error handling
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const cronSessionId = `cron_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  logger.info('CRON_START', 'Job processing cron triggered', {
    cronSessionId,
    userAgent: request.headers.get('user-agent')
  });

  try {
    // Verify this is a legitimate cron request
    if (!verifyVercelCron(request)) {
      logger.error('CRON_AUTH', 'Unauthorized cron request', undefined, { cronSessionId });
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Try to acquire processing lock to prevent concurrent runs
    const lockAcquired = await acquireProcessingLock(300000); // 5 minute lock
    if (!lockAcquired) {
      logger.warn('CRON_LOCK', 'Processing lock already held, skipping this run', { cronSessionId });
      return NextResponse.json({
        success: true,
        message: 'Processing lock already held, skipping',
        processingTime: Date.now() - startTime
      });
    }

    let processedJobs = 0;
    let successfulJobs = 0;
    let failedJobs = 0;
    let retriedJobs = 0;
    let deadLetterJobs = 0;

    try {
      // Get queue statistics before processing
      const initialStats = await getQueueStats();
      logger.info('CRON_QUEUE_STATS', 'Initial queue statistics', {
        cronSessionId,
        pendingJobs: initialStats.pendingJobs,
        completedJobs: initialStats.completedJobs,
        failedJobs: initialStats.failedJobs
      });

      if (initialStats.pendingJobs === 0) {
        logger.info('CRON_EMPTY_QUEUE', 'No jobs in queue, nothing to process', { cronSessionId });

        // Periodically run cleanup during idle time
        if (Math.random() < 0.1) { // 10% chance to run cleanup
          logger.info('CRON_CLEANUP', 'Running periodic cleanup during idle time', { cronSessionId });
          await performPeriodicCleanup(cronSessionId);
        }

        return NextResponse.json({
          success: true,
          message: 'No jobs to process',
          stats: initialStats,
          processingTime: Date.now() - startTime
        });
      }

      // Dequeue jobs for processing (up to batch size)
      const jobsToProcess: string[] = [];
      for (let i = 0; i < QUEUE_BATCH_SIZE; i++) {
        const queueJob = await dequeueJob();
        if (!queueJob) break;

        // Check if this is a retry job that's not ready yet
        const jobCreated = new Date(queueJob.createdAt).getTime();
        if (jobCreated > Date.now()) {
          logger.info('CRON_DELAYED_JOB', 'Job not ready for processing yet, re-queuing', {
            cronSessionId,
            jobId: queueJob.jobId,
            scheduledFor: queueJob.createdAt
          });
          // TODO: Re-queue the job - for now we'll skip it
          continue;
        }

        jobsToProcess.push(queueJob.jobId);
        processedJobs++;
      }

      logger.info('CRON_BATCH_START', `Starting batch processing`, {
        cronSessionId,
        batchSize: jobsToProcess.length,
        jobIds: jobsToProcess
      });

      if (jobsToProcess.length === 0) {
        return NextResponse.json({
          success: true,
          message: 'No jobs dequeued (queue may be empty or jobs not ready)',
          processingTime: Date.now() - startTime
        });
      }

      // Process jobs individually with enhanced error handling
      const results = [];
      for (const jobId of jobsToProcess) {
        const jobStartTime = Date.now();

        try {
          logger.jobStart(jobId, {});

          const result = await processJobBatch([jobId]);
          const jobResult = result[0];

          if (jobResult.success) {
            successfulJobs++;
            logger.jobComplete(jobId, Date.now() - jobStartTime, jobResult.result);

            // Update metrics for successful job
            await updateJobMetrics({
              success: true,
              processingTimeMs: Date.now() - jobStartTime
            });
          } else {
            // Job failed - determine if it should be retried
            const jobMetadata = await import('@/lib/jobs/queue').then(m => m.getJobMetadata(jobId));

            if (jobMetadata && jobResult.retryable) {
              const wasRetried = await scheduleJobRetry(
                jobMetadata,
                jobResult.error || 'Unknown error',
                Date.now() - jobStartTime
              );

              if (wasRetried) {
                retriedJobs++;
                logger.info('CRON_JOB_RETRIED', `Job ${jobId} scheduled for retry`, {
                  cronSessionId,
                  jobId,
                  retryCount: (jobMetadata.error?.retryCount || 0) + 1
                });
              } else {
                deadLetterJobs++;
                logger.jobDeadLetter(
                  jobId,
                  jobMetadata.error?.retryCount || 0,
                  jobResult.error || 'Unknown error'
                );
              }
            } else {
              failedJobs++;
              logger.jobFailed(
                jobId,
                jobResult.error || 'Unknown error',
                Date.now() - jobStartTime,
                0
              );
            }

            // Update metrics for failed job
            await updateJobMetrics({
              success: false,
              processingTimeMs: Date.now() - jobStartTime,
              errorType: jobResult.error?.split(':')[0] || 'unknown_error'
            });
          }

          results.push(jobResult);

        } catch (jobError) {
          failedJobs++;
          const errorMessage = jobError instanceof Error ? jobError.message : 'Unknown processing error';

          logger.jobFailed(jobId, errorMessage, Date.now() - jobStartTime, 0);

          results.push({
            jobId,
            success: false,
            error: errorMessage,
            retryable: true
          });

          // Update metrics for processing error
          await updateJobMetrics({
            success: false,
            processingTimeMs: Date.now() - jobStartTime,
            errorType: 'processing_error'
          });
        }
      }

      // Update final statistics
      await updateStats({
        completedJobs: initialStats.completedJobs + successfulJobs,
        failedJobs: initialStats.failedJobs + failedJobs
      });

      // Get final statistics
      const finalStats = await getQueueStats();
      const processingTime = Date.now() - startTime;

      logger.info('CRON_BATCH_COMPLETE', 'Cron batch processing completed', {
        cronSessionId,
        processingTime,
        processed: processedJobs,
        successful: successfulJobs,
        failed: failedJobs,
        retried: retriedJobs,
        deadLetter: deadLetterJobs
      });

      logger.metric('CRON_BATCH', 'processing_time_ms', processingTime, 'milliseconds', { cronSessionId });
      logger.metric('CRON_BATCH', 'jobs_processed', processedJobs, 'count', { cronSessionId });
      logger.metric('CRON_BATCH', 'jobs_successful', successfulJobs, 'count', { cronSessionId });
      logger.metric('CRON_BATCH', 'jobs_failed', failedJobs, 'count', { cronSessionId });

      return NextResponse.json({
        success: true,
        message: `Processed ${processedJobs} jobs`,
        results: {
          processed: processedJobs,
          successful: successfulJobs,
          failed: failedJobs,
          retried: retriedJobs,
          deadLetter: deadLetterJobs
        },
        stats: {
          before: initialStats,
          after: finalStats
        },
        processingTime,
        cronSessionId
      });

    } finally {
      // Always release the processing lock
      await releaseProcessingLock();
      logger.info('CRON_LOCK_RELEASED', 'Processing lock released', { cronSessionId });
    }

  } catch (error) {
    const processingTime = Date.now() - startTime;
    logger.error('CRON_FATAL_ERROR', 'Fatal error during job processing', error as Error, {
      cronSessionId,
      processingTime
    });

    // Make sure to release lock on error
    try {
      await releaseProcessingLock();
    } catch (lockError) {
      logger.error('CRON_LOCK_ERROR', 'Failed to release processing lock', lockError as Error, {
        cronSessionId
      });
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime,
        cronSessionId
      },
      { status: 500 }
    );
  }
}

/**
 * Perform periodic cleanup during idle time
 */
async function performPeriodicCleanup(cronSessionId: string) {
  try {
    const cleanupLockAcquired = await acquireCleanupLock(60000); // 1 minute lock
    if (!cleanupLockAcquired) {
      logger.info('CRON_CLEANUP_SKIP', 'Cleanup already running, skipping', { cronSessionId });
      return;
    }

    try {
      // Clean up jobs older than 7 days
      const cleanupResult = await cleanupOldJobs(7);

      logger.info('CRON_CLEANUP_COMPLETE', 'Periodic cleanup completed', {
        cronSessionId,
        cleanedJobs: cleanupResult.cleanedJobs,
        cleanedBlobs: cleanupResult.cleanedBlobs,
        errors: cleanupResult.errors.length
      });

      if (cleanupResult.errors.length > 0) {
        logger.warn('CRON_CLEANUP_ERRORS', 'Cleanup completed with errors', {
          cronSessionId,
          errors: cleanupResult.errors.slice(0, 5) // Log first 5 errors
        });
      }

    } finally {
      await releaseCleanupLock();
    }

  } catch (cleanupError) {
    logger.error('CRON_CLEANUP_ERROR', 'Periodic cleanup failed', cleanupError as Error, {
      cronSessionId
    });
  }
}

/**
 * Handle manual triggers via GET (for testing)
 */
export async function GET(request: NextRequest) {
  // Only allow in development
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'Manual cron triggers not allowed in production' },
      { status: 403 }
    );
  }

  console.log('[cron] Manual cron trigger (development mode)');

  // Create a mock request for the POST handler
  const mockRequest = new NextRequest(request.url, {
    method: 'POST',
    headers: new Headers({
      'user-agent': 'manual-trigger',
      'x-vercel-cron': '1'
    })
  });

  return POST(mockRequest);
}

/**
 * Handle unsupported methods
 */
export async function PUT() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  );
}

export async function DELETE() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  );
}