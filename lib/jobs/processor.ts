/**
 * Job Processor for Async File Ingestion
 *
 * This module handles the actual processing of queued jobs,
 * including file download from Blob, content extraction, and result storage.
 */

import { ingestFile } from '@/lib/ingestion/core';
import { IngestionOptions, IngestionProgress } from '@/lib/ingestion/types';
import {
  JobProcessingResult,
  JOB_TIMEOUT
} from './types';
import {
  updateJobStatus,
  completeJob,
  failJob,
  startJobProcessing
} from './queue';

/**
 * Download file from Vercel Blob
 */
async function downloadFileFromBlob(blobUrl: string): Promise<Buffer> {
  console.log(`[processor] Downloading file from blob: ${blobUrl}`);

  const response = await fetch(blobUrl);
  if (!response.ok) {
    throw new Error(`Failed to download file from blob: ${response.status} ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  console.log(`[processor] Downloaded ${buffer.length} bytes from blob`);
  return buffer;
}

/**
 * Process a single job
 */
export async function processJob(jobId: string): Promise<JobProcessingResult> {
  const startTime = Date.now();

  try {
    console.log(`[processor] Starting job ${jobId}`);

    // Mark job as processing
    await startJobProcessing(jobId);

    // Get job metadata from a separate import to avoid circular dependencies
    const { getJobMetadata } = await import('./queue');
    const jobMetadata = await getJobMetadata(jobId);

    if (!jobMetadata) {
      throw new Error(`Job metadata not found for ${jobId}`);
    }

    // Update progress
    await updateJobStatus(jobId, {
      progress: {
        currentStep: 'Downloading file',
        percentage: 10,
        details: `Downloading ${jobMetadata.file.name} from storage`
      }
    });

    // Download file from Blob
    const fileBuffer = await downloadFileFromBlob(jobMetadata.file.blobUrl);

    // Update progress
    await updateJobStatus(jobId, {
      progress: {
        currentStep: 'Processing file',
        percentage: 30,
        details: 'Starting content extraction and analysis'
      }
    });

    // Set up ingestion options
    const options: IngestionOptions = {
      priority: jobMetadata.options.priority,
      extractMetadata: true,
      validateContent: true,
      performSecurityScan: false, // Disabled for performance in async mode
      timeout: JOB_TIMEOUT,
      userContext: {
        ...(jobMetadata.options.userId && { userId: jobMetadata.options.userId }),
        ...(jobMetadata.options.projectId && { projectId: jobMetadata.options.projectId }),
        ...(jobMetadata.options.sessionId && { sessionId: jobMetadata.options.sessionId })
      }
    };

    // Create progress callback
    const progressCallback = async (progress: IngestionProgress) => {
      // Map ingestion progress to job progress (30% to 90%)
      const jobProgress = 30 + (progress.progress * 0.6);

      await updateJobStatus(jobId, {
        progress: {
          currentStep: progress.currentStep,
          percentage: Math.round(jobProgress),
          details: progress.details || 'Processing...'
        }
      });
    };

    // Process the file through the core ingestion engine
    console.log(`[processor] Processing ${jobMetadata.file.name} with core ingestion`);
    const ingestionResult = await ingestFile(
      jobMetadata.file.name,
      fileBuffer,
      jobMetadata.file.type,
      options,
      progressCallback
    );

    const processingTime = Date.now() - startTime;

    // Handle ingestion result
    if (!ingestionResult.success || ingestionResult.error) {
      console.error(`[processor] Ingestion failed for job ${jobId}:`, ingestionResult.error);

      await failJob(jobId, {
        type: ingestionResult.error?.type || 'processing_failed',
        message: ingestionResult.error?.message || 'File processing failed with unknown error',
        stackTrace: ingestionResult.error?.details,
        retryable: ingestionResult.error?.retryable || false
      });

      return {
        success: false,
        jobId,
        error: ingestionResult.error?.message || 'Processing failed',
        shouldRetry: ingestionResult.error?.retryable || false
      };
    }

    // Update progress before completion
    await updateJobStatus(jobId, {
      progress: {
        currentStep: 'Finalizing results',
        percentage: 95,
        details: 'Processing completed, saving results'
      }
    });

    // Complete the job successfully
    await completeJob(jobId, {
      ingestionId: ingestionResult.ingestionId,
      contentId: ingestionResult.content?.id || '',
      contentType: ingestionResult.content?.contentType || 'unknown',
      extractedText: ingestionResult.content?.textContent,
      metadata: {
        processingTime,
        fileSize: jobMetadata.file.size,
        warningCount: ingestionResult.warnings?.length || 0,
        contentLength: ingestionResult.content?.textContent?.length || 0,
        ...ingestionResult.content?.metadata
      }
    });

    console.log(`[processor] Job ${jobId} completed successfully in ${processingTime}ms`);

    return {
      success: true,
      jobId
    };

  } catch (error) {
    const processingTime = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const stackTrace = error instanceof Error ? error.stack : undefined;

    console.error(`[processor] Job ${jobId} failed after ${processingTime}ms:`, error);

    // Determine if error is retryable
    const retryable = (
      errorMessage.includes('timeout') ||
      errorMessage.includes('network') ||
      errorMessage.includes('blob') ||
      errorMessage.includes('download') ||
      (error as { code?: string })?.code === 'ETIMEDOUT'
    );

    await failJob(jobId, {
      type: 'processing_error',
      message: errorMessage,
      stackTrace,
      retryable
    });

    return {
      success: false,
      jobId,
      error: errorMessage,
      shouldRetry: retryable,
      retryAfter: retryable ? 60 : undefined // Retry after 1 minute if retryable
    };
  }
}

/**
 * Process multiple jobs with timeout handling
 */
export async function processJobBatch(jobIds: string[]): Promise<JobProcessingResult[]> {
  console.log(`[processor] Processing batch of ${jobIds.length} jobs`);

  const results: JobProcessingResult[] = [];

  for (const jobId of jobIds) {
    try {
      const result = await processJob(jobId);
      results.push(result);

      // Small delay between jobs to prevent overwhelming the system
      if (jobIds.length > 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      console.error(`[processor] Batch processing failed for job ${jobId}:`, error);

      results.push({
        success: false,
        jobId,
        error: error instanceof Error ? error.message : 'Batch processing failed'
      });
    }
  }

  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  console.log(`[processor] Batch complete: ${successful} successful, ${failed} failed`);

  return results;
}