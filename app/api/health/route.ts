import { NextRequest, NextResponse } from 'next/server';
import { getServerEnv } from '@/lib/env.server';
import { performHealthCheck, JobLogger } from '@/lib/jobs/metrics';
import { getQueueStats } from '@/lib/jobs/queue';
import { HealthCheckResponse } from '@/lib/jobs/types';

const logger = JobLogger.getInstance();

/**
 * CORS headers for health check requests
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
 * GET /api/health
 * Comprehensive system health check with legacy support
 */
export async function GET(request: NextRequest): Promise<NextResponse<unknown>> {
  const startTime = Date.now();
  const { searchParams } = new URL(request.url);
  const detailed = searchParams.get('detailed') === 'true';
  const legacy = searchParams.get('legacy') === 'true';

  try {
    // Legacy health check for backward compatibility
    if (legacy) {
      const env = getServerEnv();

      const checks = {
        timestamp: new Date().toISOString(),
        status: 'healthy',
        environment: process.env.NODE_ENV,
        region: process.env.VERCEL_REGION || 'unknown',
        deployment: process.env.VERCEL_URL || 'local',
        node_version: process.version,
        memory_usage: process.memoryUsage(),
        uptime: process.uptime(),
        config: {
          file_max_size_mb: env.FILE_MAX_SIZE_MB,
          pipeline_max_tokens: env.PIPELINE_MAX_TOKENS,
          file_processing_timeout: env.FILE_PROCESSING_TIMEOUT,
          log_level: env.LOG_LEVEL,
          security_scan_enabled: env.ENABLE_FILE_SECURITY_SCAN,
          processing_logs_enabled: env.ENABLE_PROCESSING_LOGS,
          performance_monitoring_enabled: env.ENABLE_PERFORMANCE_MONITORING,
        }
      };

      return NextResponse.json(checks, {
        status: 200,
        headers: corsHeaders
      });
    }

    logger.info('HEALTH_CHECK', 'Comprehensive health check requested', {
      userAgent: request.headers.get('user-agent'),
      detailed
    });

    // Perform comprehensive health check
    const healthCheck = await performHealthCheck();

    // Add queue statistics if detailed check requested
    if (detailed) {
      try {
        const queueStats = await getQueueStats();
        healthCheck.metrics = {
          ...healthCheck.metrics,
          currentQueueSize: queueStats.pendingJobs,
          oldestJobAge: queueStats.pendingJobs > 0 ?
            Date.now() - new Date(queueStats.oldestJobCreated || Date.now()).getTime() : 0
        };
      } catch (queueError) {
        logger.warn('HEALTH_CHECK', 'Failed to get queue stats for detailed health check', {
          error: queueError instanceof Error ? queueError.message : 'Unknown error'
        });

        if (!healthCheck.alerts) {
          healthCheck.alerts = [];
        }
        healthCheck.alerts.push({
          level: 'warning',
          message: 'Unable to retrieve queue statistics',
          component: 'queue-stats',
          timestamp: new Date().toISOString()
        });
      }
    }

    const healthCheckDuration = Date.now() - startTime;

    logger.info('HEALTH_CHECK', 'Health check completed', {
      status: healthCheck.status,
      duration: healthCheckDuration,
      alertsCount: healthCheck.alerts?.length || 0
    });

    logger.metric('HEALTH_CHECK', 'duration_ms', healthCheckDuration, 'milliseconds');
    logger.metric('HEALTH_CHECK', 'status', healthCheck.status === 'healthy' ? 1 : 0, 'boolean');

    // Set appropriate HTTP status based on health
    const httpStatus = getHttpStatusFromHealth(healthCheck.status);

    return NextResponse.json(healthCheck, {
      status: httpStatus,
      headers: {
        ...corsHeaders,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });

  } catch (error) {
    const healthCheckDuration = Date.now() - startTime;

    logger.error('HEALTH_CHECK', 'Health check failed catastrophically', error as Error, {
      duration: healthCheckDuration
    });

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
      environment: process.env.NODE_ENV,
    }, {
      status: 503,
      headers: corsHeaders
    });
  }
}

/**
 * POST /api/health
 * Trigger manual health check actions
 */
export async function POST(request: NextRequest): Promise<NextResponse<unknown>> {
  try {
    const body = await request.json();
    const { action } = body;

    logger.info('HEALTH_CHECK', 'Manual health action requested', { action });

    switch (action) {
      case 'force_check':
        const healthCheck = await performHealthCheck();
        logger.info('HEALTH_CHECK', 'Manual health check completed', {
          status: healthCheck.status
        });

        return NextResponse.json({
          success: true,
          data: healthCheck
        }, {
          status: 200,
          headers: corsHeaders
        });

      default:
        return NextResponse.json({
          success: false,
          error: {
            type: 'invalid_action',
            message: `Unknown action: ${action}. Supported actions: force_check`
          }
        }, {
          status: 400,
          headers: corsHeaders
        });
    }

  } catch (error) {
    logger.error('HEALTH_CHECK', 'Manual health action failed', error as Error);

    return NextResponse.json({
      success: false,
      error: {
        type: 'internal_server_error',
        message: 'Failed to perform health check action'
      }
    }, {
      status: 500,
      headers: corsHeaders
    });
  }
}

/**
 * Map health status to appropriate HTTP status code
 */
function getHttpStatusFromHealth(healthStatus: HealthCheckResponse['status']): number {
  switch (healthStatus) {
    case 'healthy':
      return 200;
    case 'degraded':
      return 200;
    case 'unhealthy':
      return 503;
    default:
      return 500;
  }
}