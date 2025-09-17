/**
 * Job Status Lookup Endpoint
 *
 * This endpoint provides real-time status updates for async file ingestion jobs.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getJobMetadata } from '@/lib/jobs/queue';
import { JobStatusResponse, JobStatusError } from '@/lib/jobs/types';

/**
 * CORS headers for cross-origin requests
 */
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
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
 * Get job status
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
): Promise<NextResponse<JobStatusResponse | JobStatusError>> {
  const { jobId } = await params;

  try {
    console.log(`[status] Fetching status for job: ${jobId}`);

    // Validate job ID format
    if (!jobId || !jobId.startsWith('job_')) {
      return NextResponse.json<JobStatusError>(
        {
          success: false,
          error: {
            type: 'invalid_job_id',
            message: 'Invalid job ID format. Job IDs must start with "job_".'
          }
        },
        {
          status: 400,
          headers: corsHeaders
        }
      );
    }

    // Fetch job metadata
    const jobMetadata = await getJobMetadata(jobId);

    if (!jobMetadata) {
      console.log(`[status] Job not found: ${jobId}`);
      return NextResponse.json<JobStatusError>(
        {
          success: false,
          error: {
            type: 'job_not_found',
            message: `Job with ID "${jobId}" was not found. It may have expired or never existed.`
          }
        },
        {
          status: 404,
          headers: corsHeaders
        }
      );
    }

    console.log(`[status] Job ${jobId} status: ${jobMetadata.status} (${jobMetadata.progress.percentage}%)`);

    // Return job status
    const response: JobStatusResponse = {
      success: true,
      jobId,
      status: jobMetadata.status,
      progress: jobMetadata.progress,
      file: {
        name: jobMetadata.file.name,
        size: jobMetadata.file.size,
        type: jobMetadata.file.type
      },
      timestamps: {
        createdAt: jobMetadata.createdAt,
        startedAt: jobMetadata.startedAt,
        completedAt: jobMetadata.completedAt
      }
    };

    // Include result if job is completed
    if (jobMetadata.status === 'completed' && jobMetadata.result) {
      response.result = jobMetadata.result;
    }

    // Include error if job failed
    if (jobMetadata.status === 'failed' || jobMetadata.status === 'retrying') {
      if (jobMetadata.error) {
        response.error = {
          type: jobMetadata.error.type,
          message: jobMetadata.error.message,
          retryable: jobMetadata.error.retryable,
          retryCount: jobMetadata.error.retryCount,
          lastRetryAt: jobMetadata.error.lastRetryAt
        };
      }
    }

    return NextResponse.json<JobStatusResponse>(
      response,
      {
        status: 200,
        headers: corsHeaders
      }
    );

  } catch (error) {
    console.error(`[status] Error fetching job status for ${jobId}:`, error);

    return NextResponse.json<JobStatusError>(
      {
        success: false,
        error: {
          type: 'internal_server_error',
          message: 'An internal server error occurred while fetching job status.'
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
export async function POST() {
  return NextResponse.json<JobStatusError>(
    {
      success: false,
      error: {
        type: 'method_not_allowed',
        message: 'POST method is not supported for this endpoint. Use GET to check job status.'
      }
    },
    {
      status: 405,
      headers: {
        ...corsHeaders,
        'Allow': 'GET, OPTIONS'
      }
    }
  );
}

export async function PUT() {
  return NextResponse.json<JobStatusError>(
    {
      success: false,
      error: {
        type: 'method_not_allowed',
        message: 'PUT method is not supported for this endpoint. Use GET to check job status.'
      }
    },
    {
      status: 405,
      headers: {
        ...corsHeaders,
        'Allow': 'GET, OPTIONS'
      }
    }
  );
}

export async function DELETE() {
  return NextResponse.json<JobStatusError>(
    {
      success: false,
      error: {
        type: 'method_not_allowed',
        message: 'DELETE method is not supported for this endpoint. Use GET to check job status.'
      }
    },
    {
      status: 405,
      headers: {
        ...corsHeaders,
        'Allow': 'GET, OPTIONS'
      }
    }
  );
}