/**
 * Queue Management Admin Endpoint
 *
 * This endpoint provides queue statistics and management capabilities
 * for monitoring the async job processing system.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getQueueStats,
  cleanupOldJobs,
  acquireProcessingLock,
  releaseProcessingLock
} from '@/lib/jobs/queue';

/**
 * CORS headers
 */
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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
 * Get queue statistics
 */
export async function GET() {
  try {
    console.log('[admin/queue] Fetching queue statistics');

    const stats = await getQueueStats();

    // Add some additional runtime info
    const response = {
      success: true,
      timestamp: new Date().toISOString(),
      queue: stats,
      system: {
        nodeVersion: process.version,
        platform: process.platform,
        memory: process.memoryUsage(),
        uptime: process.uptime()
      }
    };

    return NextResponse.json(response, {
      status: 200,
      headers: corsHeaders
    });

  } catch (error) {
    console.error('[admin/queue] Error fetching queue stats:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      {
        status: 500,
        headers: corsHeaders
      }
    );
  }
}

/**
 * Queue management operations
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    console.log(`[admin/queue] Performing action: ${action}`);

    switch (action) {
      case 'cleanup':
        const daysOld = body.daysOld || 7;
        const cleaned = await cleanupOldJobs(daysOld);

        return NextResponse.json({
          success: true,
          message: `Cleaned up ${cleaned} old jobs`,
          cleanedCount: cleaned
        }, {
          headers: corsHeaders
        });

      case 'force_unlock':
        await releaseProcessingLock();

        return NextResponse.json({
          success: true,
          message: 'Processing lock forcibly released'
        }, {
          headers: corsHeaders
        });

      case 'check_lock':
        const lockAcquired = await acquireProcessingLock(1); // 1 second test
        if (lockAcquired) {
          await releaseProcessingLock();
          return NextResponse.json({
            success: true,
            locked: false,
            message: 'No active processing lock'
          }, {
            headers: corsHeaders
          });
        } else {
          return NextResponse.json({
            success: true,
            locked: true,
            message: 'Processing lock is currently held'
          }, {
            headers: corsHeaders
          });
        }

      default:
        return NextResponse.json({
          success: false,
          error: `Unknown action: ${action}`,
          availableActions: ['cleanup', 'force_unlock', 'check_lock']
        }, {
          status: 400,
          headers: corsHeaders
        });
    }

  } catch (error) {
    console.error('[admin/queue] Error performing action:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      {
        status: 500,
        headers: corsHeaders
      }
    );
  }
}

/**
 * Handle unsupported methods
 */
export async function PUT() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405, headers: corsHeaders }
  );
}

export async function DELETE() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405, headers: corsHeaders }
  );
}