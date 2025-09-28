/**
 * Job Dashboard API Endpoint
 * Provides comprehensive dashboard data for system monitoring and analytics
 */

import { NextRequest, NextResponse } from 'next/server';
import { createJobManager } from '@/lib/jobs/manager';
import { createMetricsCollector } from '@/lib/jobs/metrics';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface DashboardQuery {
  hours?: number;
  include_trends?: boolean;
  include_alerts?: boolean;
  include_recommendations?: boolean;
}

export async function GET(request: NextRequest) {
  try {
    // Authentication
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized - Bearer token required' },
        { status: 401 }
      );
    }

    const url = new URL(request.url);
    const hours = parseInt(url.searchParams.get('hours') || '24');
    const includeTrends = url.searchParams.get('include_trends') === 'true';
    const includeAlerts = url.searchParams.get('include_alerts') === 'true';
    const includeRecommendations = url.searchParams.get('include_recommendations') === 'true';

    // Validate hours parameter
    if (isNaN(hours) || hours < 1 || hours > 168) {
      return NextResponse.json(
        { error: 'Invalid hours parameter. Must be between 1 and 168 (7 days)' },
        { status: 400 }
      );
    }

    const jobManager = createJobManager();
    const metricsCollector = createMetricsCollector();

    // Get core dashboard data
    const [statistics, health, stuckJobs, recentEvents] = await Promise.all([
      jobManager.getJobStatistics(hours),
      jobManager.getSystemHealth(),
      jobManager.getProcessingJobs({ stuckOnly: true, limit: 50 }),
      jobManager.getJobEvents({ limit: 20, hoursBack: Math.min(hours, 24) })
    ]);

    // Calculate key metrics
    const totalJobs = statistics.overall.total_jobs;
    const successRate = totalJobs > 0
      ? Math.round((statistics.overall.completed_count / totalJobs) * 100)
      : 100;
    const failureRate = totalJobs > 0
      ? Math.round((statistics.overall.failed_count / totalJobs) * 100)
      : 0;
    const avgProcessingMinutes = Math.round((statistics.overall.avg_processing_time_ms || 0) / 60000);

    // Build dashboard response
    const dashboardData: any = {
      timestamp: Date.now(),
      period_hours: hours,

      // Overview metrics
      overview: {
        total_jobs: totalJobs,
        success_rate: successRate,
        failure_rate: failureRate,
        avg_processing_time_minutes: avgProcessingMinutes,
        stuck_jobs_count: stuckJobs.length,
        system_health_score: health.healthy ? 100 : Math.max(0, 100 - health.issues.length * 20)
      },

      // Current status
      current_status: {
        queued_jobs: statistics.overall.queued_count,
        processing_jobs: statistics.overall.processing_count,
        failed_jobs: statistics.overall.failed_count,
        completed_jobs: statistics.overall.completed_count,
        system_healthy: health.healthy,
        active_issues: health.issues.length
      },

      // Performance metrics
      performance: {
        throughput: {
          jobs_per_hour: totalJobs > 0 ? Math.round(totalJobs / hours) : 0,
          avg_processing_time_ms: statistics.overall.avg_processing_time_ms || 0,
          success_rate_percent: successRate,
          failure_rate_percent: failureRate
        },
        queue_metrics: {
          current_depth: statistics.overall.queued_count,
          processing_capacity: statistics.overall.processing_count,
          stuck_jobs: stuckJobs.length
        }
      },

      // Job type breakdown
      job_breakdown: {
        by_type: statistics.by_type_and_status || {},
        by_status: {
          pending: statistics.overall.queued_count,
          running: statistics.overall.processing_count,
          completed: statistics.overall.completed_count,
          failed: statistics.overall.failed_count
        }
      },

      // Recent activity
      recent_activity: {
        last_24h: await getRecentActivitySummary(jobManager, 24),
        events: recentEvents.slice(0, 10).map(event => ({
          timestamp: event.created_at,
          type: event.event_type,
          job_type: event.job_type,
          message: `${event.event_type} ${event.job_type} job`,
          status_change: event.previous_status !== event.new_status
            ? `${event.previous_status} → ${event.new_status}`
            : null
        }))
      }
    };

    // Add trends if requested
    if (includeTrends) {
      dashboardData.trends = await generateTrendData(jobManager, hours);
    }

    // Add alerts if requested
    if (includeAlerts) {
      const alerts = await metricsCollector.checkAlertConditions();
      dashboardData.alerts = {
        active_count: alerts.length,
        critical_count: alerts.filter(a => a.severity === 'critical').length,
        alerts: alerts.map(alert => ({
          id: alert.id,
          severity: alert.severity,
          title: alert.title,
          message: alert.message,
          first_seen: new Date(alert.first_seen).toISOString(),
          duration_minutes: Math.round((Date.now() - alert.first_seen) / 60000)
        }))
      };
    }

    // Add recommendations if requested
    if (includeRecommendations) {
      dashboardData.recommendations = await generateRecommendations(
        statistics,
        health,
        stuckJobs
      );
    }

    // Add system information
    dashboardData.system_info = {
      uptime_hours: Math.round(process.uptime() / 3600),
      memory_usage_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      node_version: process.version,
      environment: process.env.NODE_ENV || 'unknown',
      region: process.env.VERCEL_REGION || 'unknown'
    };

    return NextResponse.json(dashboardData);

  } catch (error) {
    console.error('[Job Dashboard] Error generating dashboard data:', error);

    return NextResponse.json(
      {
        error: 'Failed to generate dashboard data',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now()
      },
      { status: 500 }
    );
  }
}

// Helper function to get recent activity summary
async function getRecentActivitySummary(jobManager: any, hours: number) {
  const events = await jobManager.getJobEvents({ hoursBack: hours, limit: 1000 });

  const summary = {
    total_events: events.length,
    jobs_started: events.filter(e => e.event_type === 'started').length,
    jobs_completed: events.filter(e => e.event_type === 'completed').length,
    jobs_failed: events.filter(e => e.event_type === 'failed').length,
    jobs_retried: events.filter(e => e.event_type === 'retried').length,
    jobs_recovered: events.filter(e => e.event_type === 'recovered').length,

    // Hourly breakdown for the last 24 hours
    hourly_activity: Array.from({ length: Math.min(hours, 24) }, (_, i) => {
      const hourStart = Date.now() - (i + 1) * 60 * 60 * 1000;
      const hourEnd = Date.now() - i * 60 * 60 * 1000;

      const hourEvents = events.filter(e => {
        const eventTime = new Date(e.created_at).getTime();
        return eventTime >= hourStart && eventTime < hourEnd;
      });

      return {
        hour: new Date(hourStart).toISOString().substring(0, 13) + ':00:00Z',
        events: hourEvents.length,
        completed: hourEvents.filter(e => e.event_type === 'completed').length,
        failed: hourEvents.filter(e => e.event_type === 'failed').length
      };
    }).reverse()
  };

  return summary;
}

// Helper function to generate trend data
async function generateTrendData(jobManager: any, hours: number) {
  // Get statistics for different time periods to show trends
  const [current, previous] = await Promise.all([
    jobManager.getJobStatistics(Math.min(hours, 24)),
    jobManager.getJobStatistics(Math.min(hours * 2, 48))
  ]);

  const currentTotal = current.overall.total_jobs;
  const previousTotal = previous.overall.total_jobs - currentTotal;

  const trends = {
    job_volume: {
      current_period: currentTotal,
      previous_period: previousTotal,
      change_percent: previousTotal > 0
        ? Math.round(((currentTotal - previousTotal) / previousTotal) * 100)
        : 0,
      trend: currentTotal > previousTotal ? 'up' : currentTotal < previousTotal ? 'down' : 'stable'
    },

    success_rate: {
      current: currentTotal > 0
        ? Math.round((current.overall.completed_count / currentTotal) * 100)
        : 100,
      previous: previousTotal > 0
        ? Math.round(((previous.overall.completed_count - current.overall.completed_count) / previousTotal) * 100)
        : 100
    },

    processing_time: {
      current_avg_ms: current.overall.avg_processing_time_ms || 0,
      // Would need historical data for proper trend calculation
      trend: 'stable'
    }
  };

  // Add trend direction
  trends.success_rate.trend = trends.success_rate.current > trends.success_rate.previous
    ? 'up' : trends.success_rate.current < trends.success_rate.previous ? 'down' : 'stable';

  return trends;
}

// Helper function to generate recommendations
async function generateRecommendations(statistics: any, health: any, stuckJobs: any[]) {
  const recommendations: Array<{
    priority: 'high' | 'medium' | 'low';
    category: string;
    title: string;
    description: string;
    action: string;
  }> = [];

  // High priority recommendations
  if (stuckJobs.length > 0) {
    recommendations.push({
      priority: 'high',
      category: 'Recovery',
      title: 'Stuck Jobs Detected',
      description: `${stuckJobs.length} jobs are stuck and need recovery`,
      action: 'Run job recovery process via POST /api/jobs/recover'
    });
  }

  if (!health.healthy) {
    recommendations.push({
      priority: 'high',
      category: 'System Health',
      title: 'System Health Issues',
      description: `${health.issues.length} health issues detected: ${health.issues.join(', ')}`,
      action: 'Investigate and resolve health issues'
    });
  }

  // Medium priority recommendations
  const failureRate = statistics.overall.total_jobs > 0
    ? Math.round((statistics.overall.failed_count / statistics.overall.total_jobs) * 100)
    : 0;

  if (failureRate > 20) {
    recommendations.push({
      priority: 'medium',
      category: 'Reliability',
      title: 'High Failure Rate',
      description: `${failureRate}% of jobs are failing`,
      action: 'Review error logs and job configurations'
    });
  }

  if (statistics.overall.queued_count > 50) {
    recommendations.push({
      priority: 'medium',
      category: 'Performance',
      title: 'Large Queue',
      description: `${statistics.overall.queued_count} jobs waiting in queue`,
      action: 'Consider scaling processing capacity'
    });
  }

  if ((statistics.overall.avg_processing_time_ms || 0) > 30 * 60 * 1000) {
    recommendations.push({
      priority: 'medium',
      category: 'Performance',
      title: 'Slow Processing',
      description: `Average processing time exceeds 30 minutes`,
      action: 'Optimize job processing logic or increase timeouts'
    });
  }

  // Low priority recommendations
  if (statistics.overall.total_jobs === 0) {
    recommendations.push({
      priority: 'low',
      category: 'Monitoring',
      title: 'No Recent Activity',
      description: 'No jobs processed in the selected time period',
      action: 'Verify system is receiving job requests'
    });
  }

  return recommendations.sort((a, b) => {
    const priorityOrder = { high: 3, medium: 2, low: 1 };
    return priorityOrder[b.priority] - priorityOrder[a.priority];
  });
}

// Export dashboard data in different formats
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized - Bearer token required' },
        { status: 401 }
      );
    }

    const body: DashboardQuery & { format?: 'json' | 'csv' | 'prometheus' } = await request.json();
    const { format = 'json', hours = 24 } = body;

    if (format === 'prometheus') {
      const metricsCollector = createMetricsCollector();
      const prometheusMetrics = await metricsCollector.exportPrometheusMetrics();

      return new NextResponse(prometheusMetrics, {
        headers: {
          'Content-Type': 'text/plain; version=0.0.4; charset=utf-8'
        }
      });
    }

    // For JSON and CSV, get the full dashboard data first
    const dashboardRequest = new NextRequest(request.url + `?hours=${hours}&include_trends=true&include_alerts=true&include_recommendations=true`, {
      method: 'GET',
      headers: request.headers
    });

    const dashboardResponse = await GET(dashboardRequest);
    const dashboardData = await dashboardResponse.json();

    if (format === 'csv') {
      const csv = convertDashboardToCSV(dashboardData);
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="job-dashboard-${new Date().toISOString().split('T')[0]}.csv"`
        }
      });
    }

    return NextResponse.json(dashboardData);

  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to export dashboard data',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// Helper function to convert dashboard data to CSV
function convertDashboardToCSV(data: any): string {
  const lines = [
    'metric,value,unit,category',
    `total_jobs,${data.overview.total_jobs},count,overview`,
    `success_rate,${data.overview.success_rate},percent,overview`,
    `failure_rate,${data.overview.failure_rate},percent,overview`,
    `avg_processing_time,${data.overview.avg_processing_time_minutes},minutes,overview`,
    `stuck_jobs,${data.overview.stuck_jobs_count},count,overview`,
    `queued_jobs,${data.current_status.queued_jobs},count,current`,
    `processing_jobs,${data.current_status.processing_jobs},count,current`,
    `failed_jobs,${data.current_status.failed_jobs},count,current`,
    `completed_jobs,${data.current_status.completed_jobs},count,current`,
    `system_healthy,${data.current_status.system_healthy ? 1 : 0},boolean,current`,
    `memory_usage,${data.system_info.memory_usage_mb},mb,system`,
    `uptime,${data.system_info.uptime_hours},hours,system`
  ];

  return lines.join('\n');
}