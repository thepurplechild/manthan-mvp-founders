/**
 * Admin Jobs Management Endpoint
 *
 * This endpoint provides administrative access to failed jobs,
 * dead letter queue management, and job metrics.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDeadLetterJobs, cleanupOldJobs } from '@/lib/jobs/queue';
import { getJobMetrics } from '@/lib/jobs/metrics';
import {
  AdminJobsResponse,
  AdminJobsError,
  DeadLetterJob
} from '@/lib/jobs/types';

/**
 * CORS headers for admin requests
 */
const corsHeaders = {
  'Access-Control-Allow-Origin': process.env.NODE_ENV === 'production' ? 'https://your-admin-domain.com' : '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Token',
};

/**
 * Verify admin authentication
 */
function verifyAdminAuth(request: NextRequest): boolean {
  const adminToken = process.env.ADMIN_TOKEN;
  const authHeader = request.headers.get('authorization');
  const adminTokenHeader = request.headers.get('x-admin-token');

  // Check both Authorization header and X-Admin-Token header
  const providedToken = authHeader?.replace('Bearer ', '') || adminTokenHeader;

  if (!adminToken || !providedToken) {
    return false;
  }

  return providedToken === adminToken;
}

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
 * GET /api/admin/jobs
 * Retrieve failed jobs and system metrics
 */
export async function GET(request: NextRequest): Promise<NextResponse<AdminJobsResponse | AdminJobsError>> {
  try {
    // Verify admin authentication
    if (!verifyAdminAuth(request)) {
      return NextResponse.json<AdminJobsError>(
        {
          success: false,
          error: {
            type: 'unauthorized',
            message: 'Admin authentication required'
          }
        },
        {
          status: 401,
          headers: corsHeaders
        }
      );
    }

    const { searchParams } = new URL(request.url);

    // Parse query parameters
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = Math.min(parseInt(searchParams.get('pageSize') || '50'), 100); // Cap at 100
    const errorType = searchParams.get('errorType') || undefined;
    const dateFrom = searchParams.get('dateFrom') || undefined;
    const dateTo = searchParams.get('dateTo') || undefined;

    console.log(`[admin/jobs] GET request - page: ${page}, pageSize: ${pageSize}`);

    // Get dead letter jobs with pagination
    const { jobs, totalCount } = await getDeadLetterJobs(page, pageSize);

    // Apply client-side filters (since KV doesn't support complex queries)
    let filteredJobs = jobs;

    if (errorType) {
      filteredJobs = filteredJobs.filter(job =>
        job.failureInfo.lastError.toLowerCase().includes(errorType.toLowerCase())
      );
    }

    if (dateFrom || dateTo) {
      filteredJobs = filteredJobs.filter(job => {
        const jobDate = new Date(job.failureInfo.failedAt);
        const fromDate = dateFrom ? new Date(dateFrom) : new Date(0);
        const toDate = dateTo ? new Date(dateTo) : new Date();
        return jobDate >= fromDate && jobDate <= toDate;
      });
    }

    const totalPages = Math.ceil(totalCount / pageSize);

    const response: AdminJobsResponse = {
      success: true,
      data: {
        deadLetterJobs: filteredJobs,
        totalCount,
        pagination: {
          page,
          pageSize,
          totalPages
        },
        filters: {
          ...(errorType && { errorType }),
          ...(dateFrom && dateTo && { dateRange: [dateFrom, dateTo] })
        }
      }
    };

    console.log(`[admin/jobs] Returning ${filteredJobs.length} jobs out of ${totalCount} total`);

    return NextResponse.json(response, {
      status: 200,
      headers: corsHeaders
    });

  } catch (error) {
    console.error('[admin/jobs] GET error:', error);

    return NextResponse.json<AdminJobsError>(
      {
        success: false,
        error: {
          type: 'internal_server_error',
          message: 'Failed to retrieve admin jobs data'
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
 * POST /api/admin/jobs
 * Perform administrative actions on jobs
 */
export async function POST(request: NextRequest): Promise<NextResponse<unknown>> {
  try {
    // Verify admin authentication
    if (!verifyAdminAuth(request)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            type: 'unauthorized',
            message: 'Admin authentication required'
          }
        },
        {
          status: 401,
          headers: corsHeaders
        }
      );
    }

    const body = await request.json();
    const { action, ...params } = body;

    console.log(`[admin/jobs] POST action: ${action}`);

    switch (action) {
      case 'cleanup_old_jobs': {
        const { olderThanDays = 7 } = params;
        const result = await cleanupOldJobs(olderThanDays);

        console.log(`[admin/jobs] Cleanup completed:`, result);

        return NextResponse.json({
          success: true,
          data: {
            action: 'cleanup_old_jobs',
            result: {
              cleanedJobs: result.cleanedJobs,
              cleanedBlobs: result.cleanedBlobs,
              errors: result.errors
            }
          }
        }, {
          status: 200,
          headers: corsHeaders
        });
      }

      case 'get_metrics': {
        const metrics = await getJobMetrics();

        return NextResponse.json({
          success: true,
          data: {
            action: 'get_metrics',
            metrics
          }
        }, {
          status: 200,
          headers: corsHeaders
        });
      }

      default:
        return NextResponse.json(
          {
            success: false,
            error: {
              type: 'invalid_action',
              message: `Unknown action: ${action}. Supported actions: cleanup_old_jobs, get_metrics`
            }
          },
          {
            status: 400,
            headers: corsHeaders
          }
        );
    }

  } catch (error) {
    console.error('[admin/jobs] POST error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          type: 'internal_server_error',
          message: 'Failed to perform admin action'
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
 * DELETE /api/admin/jobs
 * Remove specific jobs from dead letter queue (future enhancement)
 */
export async function DELETE(request: NextRequest): Promise<NextResponse<unknown>> {
  return NextResponse.json(
    {
      success: false,
      error: {
        type: 'not_implemented',
        message: 'DELETE operation not yet implemented'
      }
    },
    {
      status: 501,
      headers: corsHeaders
    }
  );
}