import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

interface PipelineDiagnostics {
  timestamp: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  components: {
    supabase_connection: ComponentHealth;
    service_role_auth: ComponentHealth;
    database_permissions: ComponentHealth;
    ingestion_queue: ComponentHealth;
    cron_environment: ComponentHealth;
  };
  ingestion_stats: {
    total_ingestions: number;
    queued_count: number;
    running_count: number;
    completed_count: number;
    failed_count: number;
    oldest_queued?: {
      id: string;
      age_minutes: number;
      created_at: string;
    };
  };
  environment_check: {
    required_env_vars: Record<string, boolean>;
    cron_secret_configured: boolean;
    anthropic_api_configured: boolean;
    vercel_services_configured: boolean;
  };
  recent_errors?: string[];
  recommendations?: string[];
}

interface ComponentHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  message: string;
  last_checked: string;
  details?: Record<string, unknown>;
}

function log(event: string, payload: Record<string, unknown>) {
  console.log(
    JSON.stringify({
      scope: 'pipeline-health',
      event,
      ts: new Date().toISOString(),
      ...payload,
    })
  );
}

async function checkSupabaseConnection(): Promise<ComponentHealth> {
  try {
    const supabase = getAdminClient();
    const { data, error } = await supabase.from('ingestions').select('count').limit(1);

    if (error) {
      return {
        status: 'unhealthy',
        message: `Database connection failed: ${error.message}`,
        last_checked: new Date().toISOString(),
        details: { error: error.message }
      };
    }

    return {
      status: 'healthy',
      message: 'Database connection successful',
      last_checked: new Date().toISOString(),
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      message: `Connection error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      last_checked: new Date().toISOString(),
    };
  }
}

async function checkServiceRoleAuth(): Promise<ComponentHealth> {
  try {
    const supabase = getAdminClient();

    // Test service role permissions by trying to update an ingestion
    const { data: testIngestion } = await supabase
      .from('ingestions')
      .select('id')
      .limit(1)
      .single();

    if (testIngestion) {
      // Try to update with service role (should bypass RLS)
      const { error: updateError } = await supabase
        .from('ingestions')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', testIngestion.id);

      if (updateError) {
        return {
          status: 'unhealthy',
          message: `Service role lacks update permissions: ${updateError.message}`,
          last_checked: new Date().toISOString(),
          details: { error: updateError.message }
        };
      }
    }

    return {
      status: 'healthy',
      message: 'Service role authentication and permissions verified',
      last_checked: new Date().toISOString(),
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      message: `Service role check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      last_checked: new Date().toISOString(),
    };
  }
}

async function checkDatabasePermissions(): Promise<ComponentHealth> {
  try {
    const supabase = getAdminClient();

    // Test if we can call the processing lock functions
    const { data: lockResult, error: lockError } = await supabase.rpc('acquire_processing_lock', {
      p_lock_id: 'health-check-test',
      p_locked_by: 'health-check',
      p_timeout_minutes: 1,
    });

    if (lockError) {
      return {
        status: 'degraded',
        message: `RPC function test failed: ${lockError.message}`,
        last_checked: new Date().toISOString(),
        details: { error: lockError.message }
      };
    }

    // Release the test lock
    await supabase.rpc('release_processing_lock', {
      p_lock_id: 'health-check-test',
    });

    return {
      status: 'healthy',
      message: 'Database RPC functions and permissions verified',
      last_checked: new Date().toISOString(),
      details: { lock_acquired: Boolean(lockResult) }
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      message: `Database permissions check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      last_checked: new Date().toISOString(),
    };
  }
}

async function checkIngestionQueue(): Promise<ComponentHealth> {
  try {
    const supabase = getAdminClient();

    // Get queue statistics
    const { data: queueStats, error } = await supabase
      .from('ingestions')
      .select('status, created_at')
      .in('status', ['queued', 'running']);

    if (error) {
      return {
        status: 'unhealthy',
        message: `Unable to check queue status: ${error.message}`,
        last_checked: new Date().toISOString(),
        details: { error: error.message }
      };
    }

    const queuedCount = queueStats?.filter(i => i.status === 'queued').length || 0;
    const runningCount = queueStats?.filter(i => i.status === 'running').length || 0;

    // Check for stuck jobs (queued for more than 10 minutes)
    const stuckJobs = queueStats?.filter(i => {
      if (i.status !== 'queued') return false;
      const ageMinutes = (Date.now() - new Date(i.created_at).getTime()) / (1000 * 60);
      return ageMinutes > 10;
    }) || [];

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    let message = `Queue operational: ${queuedCount} queued, ${runningCount} running`;

    if (stuckJobs.length > 0) {
      status = 'degraded';
      message = `${stuckJobs.length} jobs stuck in queue for >10 minutes`;
    }

    if (queuedCount > 50) {
      status = 'degraded';
      message = `High queue backlog: ${queuedCount} jobs queued`;
    }

    return {
      status,
      message,
      last_checked: new Date().toISOString(),
      details: {
        queued_count: queuedCount,
        running_count: runningCount,
        stuck_jobs_count: stuckJobs.length
      }
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      message: `Queue check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      last_checked: new Date().toISOString(),
    };
  }
}

function checkCronEnvironment(): ComponentHealth {
  const cronSecret = process.env.CRON_SECRET;
  const requiredVars = {
    CRON_SECRET: Boolean(cronSecret),
    NEXT_PUBLIC_SUPABASE_URL: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
  };

  const missingVars = Object.entries(requiredVars)
    .filter(([, exists]) => !exists)
    .map(([name]) => name);

  if (missingVars.length > 0) {
    return {
      status: 'unhealthy',
      message: `Missing required environment variables: ${missingVars.join(', ')}`,
      last_checked: new Date().toISOString(),
      details: { missing_vars: missingVars }
    };
  }

  return {
    status: 'healthy',
    message: 'All required environment variables configured',
    last_checked: new Date().toISOString(),
    details: requiredVars
  };
}

async function getIngestionStats(supabase: ReturnType<typeof getAdminClient>) {
  const { data: stats } = await supabase
    .from('ingestions')
    .select('status, created_at, id')
    .order('created_at', { ascending: true });

  const statusCounts = {
    total_ingestions: stats?.length || 0,
    queued_count: 0,
    running_count: 0,
    completed_count: 0,
    failed_count: 0,
  };

  let oldestQueued: { id: string; age_minutes: number; created_at: string } | undefined;

  stats?.forEach(ingestion => {
    switch (ingestion.status) {
      case 'queued':
        statusCounts.queued_count++;
        if (!oldestQueued) {
          const ageMinutes = (Date.now() - new Date(ingestion.created_at).getTime()) / (1000 * 60);
          oldestQueued = {
            id: ingestion.id,
            age_minutes: Math.round(ageMinutes),
            created_at: ingestion.created_at
          };
        }
        break;
      case 'running':
      case 'processing':
        statusCounts.running_count++;
        break;
      case 'completed':
      case 'succeeded':
        statusCounts.completed_count++;
        break;
      case 'failed':
        statusCounts.failed_count++;
        break;
    }
  });

  return { ...statusCounts, oldest_queued: oldestQueued };
}

function checkEnvironmentVars() {
  const requiredVars = {
    NEXT_PUBLIC_SUPABASE_URL: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    CRON_SECRET: Boolean(process.env.CRON_SECRET),
  };

  const optionalVars = {
    ANTHROPIC_API_KEY: Boolean(process.env.ANTHROPIC_API_KEY),
    KV_URL: Boolean(process.env.KV_URL),
    BLOB_READ_WRITE_TOKEN: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
  };

  return {
    required_env_vars: requiredVars,
    cron_secret_configured: Boolean(process.env.CRON_SECRET),
    anthropic_api_configured: Boolean(process.env.ANTHROPIC_API_KEY),
    vercel_services_configured: Boolean(process.env.KV_URL && process.env.BLOB_READ_WRITE_TOKEN),
  };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  log('pipeline_health_check_start', {
    user_agent: request.headers.get('user-agent'),
    detailed: true
  });

  try {
    const supabase = getAdminClient();

    // Run all health checks in parallel
    const [
      supabaseHealth,
      serviceRoleHealth,
      dbPermissionsHealth,
      queueHealth,
      cronEnvHealth
    ] = await Promise.all([
      checkSupabaseConnection(),
      checkServiceRoleAuth(),
      checkDatabasePermissions(),
      checkIngestionQueue(),
      Promise.resolve(checkCronEnvironment())
    ]);

    const ingestionStats = await getIngestionStats(supabase);
    const environmentCheck = checkEnvironmentVars();

    // Determine overall status
    const components = {
      supabase_connection: supabaseHealth,
      service_role_auth: serviceRoleHealth,
      database_permissions: dbPermissionsHealth,
      ingestion_queue: queueHealth,
      cron_environment: cronEnvHealth,
    };

    const statuses = Object.values(components).map(c => c.status);
    const overallStatus = statuses.includes('unhealthy') ? 'unhealthy' :
                         statuses.includes('degraded') ? 'degraded' : 'healthy';

    // Generate recommendations
    const recommendations: string[] = [];

    if (ingestionStats.queued_count > 10) {
      recommendations.push('High queue backlog detected. Consider scaling processing capacity.');
    }

    if (ingestionStats.oldest_queued && ingestionStats.oldest_queued.age_minutes > 15) {
      recommendations.push(`Oldest queued job is ${ingestionStats.oldest_queued.age_minutes} minutes old. Check cron job execution.`);
    }

    if (!environmentCheck.anthropic_api_configured) {
      recommendations.push('Anthropic API key not configured. AI processing steps will use fallback logic.');
    }

    if (overallStatus === 'unhealthy') {
      recommendations.push('Critical issues detected. Check component details and resolve immediately.');
    }

    const diagnostics: PipelineDiagnostics = {
      timestamp: new Date().toISOString(),
      status: overallStatus,
      components,
      ingestion_stats: ingestionStats,
      environment_check: environmentCheck,
      recommendations: recommendations.length > 0 ? recommendations : undefined,
    };

    const duration = Date.now() - startTime;

    log('pipeline_health_check_complete', {
      status: overallStatus,
      duration,
      queued_count: ingestionStats.queued_count,
      recommendations_count: recommendations.length
    });

    return NextResponse.json(diagnostics, {
      status: overallStatus === 'unhealthy' ? 503 : 200,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    log('pipeline_health_check_error', {
      error: errorMessage,
      duration
    });

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      status: 'unhealthy',
      error: errorMessage,
      components: {
        supabase_connection: { status: 'unhealthy', message: 'Health check failed', last_checked: new Date().toISOString() },
        service_role_auth: { status: 'unhealthy', message: 'Health check failed', last_checked: new Date().toISOString() },
        database_permissions: { status: 'unhealthy', message: 'Health check failed', last_checked: new Date().toISOString() },
        ingestion_queue: { status: 'unhealthy', message: 'Health check failed', last_checked: new Date().toISOString() },
        cron_environment: { status: 'unhealthy', message: 'Health check failed', last_checked: new Date().toISOString() },
      }
    }, { status: 503 });
  }
}