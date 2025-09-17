/**
 * Asynchronous File Ingestion Start Endpoint
 *
 * This endpoint accepts file uploads, stores them in Vercel Blob,
 * and queues them for async processing.
 */

import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { getSupportedFileTypes, getMaxFileSize } from '@/lib/ingestion/core';
import { generateJobId, enqueueJob, updateStats } from '@/lib/jobs/queue';
import { JobMetadata, StartIngestionResponse, StartIngestionError } from '@/lib/jobs/types';

/**
 * CORS headers for cross-origin requests
 */
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

/**
 * Handle CORS preflight requests
 */
export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: corsHeaders,
  });
}

/**
 * Start asynchronous file ingestion
 */
export async function POST(request: NextRequest): Promise<NextResponse<StartIngestionResponse | StartIngestionError>> {
  const startTime = Date.now();

  try {
    console.log('[ingest/start] Processing async file upload request');

    // Parse multipart form data
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (error) {
      console.error('[ingest/start] Failed to parse form data:', error);
      return NextResponse.json<StartIngestionError>(
        {
          success: false,
          error: {
            type: 'invalid_request',
            message: 'Invalid multipart/form-data request. Please ensure you are sending a properly formatted multipart request.',
            suggestions: [
              'Verify Content-Type header is set to multipart/form-data',
              'Ensure the request body contains valid form data',
              'Check that the file upload is properly formatted'
            ]
          }
        },
        {
          status: 400,
          headers: corsHeaders
        }
      );
    }

    // Extract and validate file
    const file = formData.get('file') as File;
    if (!file) {
      return NextResponse.json<StartIngestionError>(
        {
          success: false,
          error: {
            type: 'validation_error',
            message: 'No file provided in the request. Please include a file in the "file" field.',
            suggestions: [
              'Ensure you are sending a POST request with multipart/form-data',
              'Include a file in the form field named "file"',
              'Check that the file is not empty'
            ]
          }
        },
        {
          status: 400,
          headers: corsHeaders
        }
      );
    }

    // Validate file properties
    if (!file.name || file.name.trim() === '') {
      return NextResponse.json<StartIngestionError>(
        {
          success: false,
          error: {
            type: 'validation_error',
            message: 'File must have a valid filename.',
            suggestions: [
              'Ensure the uploaded file has a proper filename with extension',
              'Check that the file is not corrupted'
            ]
          }
        },
        {
          status: 400,
          headers: corsHeaders
        }
      );
    }

    // Check file size
    const maxFileSize = getMaxFileSize();
    if (file.size > maxFileSize) {
      return NextResponse.json<StartIngestionError>(
        {
          success: false,
          error: {
            type: 'file_too_large',
            message: `File "${file.name}" is too large. Maximum file size is ${maxFileSize / (1024 * 1024)}MB, but file is ${(file.size / (1024 * 1024)).toFixed(2)}MB.`,
            suggestions: [
              'Try compressing the file using a ZIP utility',
              'Convert the document to a more efficient format',
              'Remove unnecessary images or media from the document',
              'Split large documents into smaller sections'
            ]
          }
        },
        {
          status: 413,
          headers: corsHeaders
        }
      );
    }

    // Validate file type
    const supportedTypes = getSupportedFileTypes();
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!supportedTypes.includes(fileExtension as (typeof supportedTypes)[number])) {
      return NextResponse.json<StartIngestionError>(
        {
          success: false,
          error: {
            type: 'unsupported_file_type',
            message: `File type "${fileExtension}" is not supported. Please use one of the supported formats: ${supportedTypes.join(', ')}.`,
            suggestions: [
              'Convert your file to a supported format (.txt, .pdf, .docx, .fdx, .celtx)',
              'If this is a script, try exporting as Final Draft (.fdx) or PDF',
              'For presentations, use PowerPoint (.pptx) or convert to PDF'
            ]
          }
        },
        {
          status: 400,
          headers: corsHeaders
        }
      );
    }

    // Generate unique job ID
    const jobId = generateJobId();
    console.log(`[ingest/start] Generated job ID: ${jobId} for file: ${file.name}`);

    // Upload file to Vercel Blob
    console.log(`[ingest/start] Uploading ${file.name} (${file.size} bytes) to Vercel Blob`);
    const blob = await put(`ingestion/${jobId}/${file.name}`, file, {
      access: 'public'
    });

    console.log(`[ingest/start] File uploaded to blob: ${blob.url}`);

    // Extract optional parameters
    const priorityParam = formData.get('priority') as string;
    const userIdParam = formData.get('userId') as string;
    const projectIdParam = formData.get('projectId') as string;
    const sessionIdParam = formData.get('sessionId') as string;

    // Create job metadata
    const jobMetadata: JobMetadata = {
      jobId,
      status: 'pending',
      file: {
        name: file.name,
        size: file.size,
        type: file.type || 'application/octet-stream',
        blobUrl: blob.url
      },
      options: {
        priority: ['low', 'medium', 'high', 'urgent'].includes(priorityParam)
          ? (priorityParam as 'low' | 'medium' | 'high' | 'urgent')
          : 'medium',
        ...(userIdParam && { userId: userIdParam }),
        ...(projectIdParam && { projectId: projectIdParam }),
        ...(sessionIdParam && { sessionId: sessionIdParam })
      },
      createdAt: new Date().toISOString(),
      progress: {
        currentStep: 'Queued for processing',
        percentage: 0,
        details: 'File uploaded successfully, waiting for processing'
      }
    };

    // Add job to queue
    await enqueueJob(jobMetadata);

    // Update statistics
    const stats = await import('@/lib/jobs/queue').then(m => m.getQueueStats());
    await updateStats({
      totalJobs: stats.totalJobs + 1
    });

    const processingTime = Date.now() - startTime;
    console.log(`[ingest/start] Job ${jobId} queued successfully in ${processingTime}ms`);

    // Estimate processing time based on file size and queue
    const estimatedMinutes = Math.max(1, Math.ceil(file.size / (1024 * 1024))); // Rough estimate
    const estimatedTime = estimatedMinutes === 1 ? '1-2 minutes' : `${estimatedMinutes}-${estimatedMinutes + 1} minutes`;

    // Return success response
    return NextResponse.json<StartIngestionResponse>(
      {
        success: true,
        jobId,
        message: `File "${file.name}" uploaded successfully and queued for processing.`,
        estimatedProcessingTime: estimatedTime,
        statusUrl: `/api/ingest/status/${jobId}`
      },
      {
        status: 202, // Accepted
        headers: corsHeaders
      }
    );

  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error(`[ingest/start] Unexpected error after ${processingTime}ms:`, error);

    return NextResponse.json<StartIngestionError>(
      {
        success: false,
        error: {
          type: 'internal_server_error',
          message: 'An internal server error occurred while starting file processing.',
          suggestions: [
            'Please try again in a few moments',
            'If the problem persists, contact support',
            'Check that your file is not corrupted'
          ]
        }
      },
      {
        status: 500,
        headers: corsHeaders
      }
    );
  }
}

/**
 * Handle unsupported HTTP methods
 */
export async function GET() {
  return NextResponse.json<StartIngestionError>(
    {
      success: false,
      error: {
        type: 'method_not_allowed',
        message: 'GET method is not supported for this endpoint. Use POST to upload files for async processing.',
        suggestions: [
          'Use POST method to upload files',
          'Include the file in multipart/form-data format',
          'Check the API documentation for proper usage'
        ]
      }
    },
    {
      status: 405,
      headers: {
        ...corsHeaders,
        'Allow': 'POST, OPTIONS'
      }
    }
  );
}