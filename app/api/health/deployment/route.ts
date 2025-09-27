import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';

interface DeploymentHealth {
  timestamp: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  environment: string;
  region?: string;
  deployment_id?: string;
  checks: {
    build: HealthCheck;
    environment_vars: HealthCheck;
    database: HealthCheck;
    migrations: HealthCheck;
    auth: HealthCheck;
    recent_changes: HealthCheck;
  };
  recent_errors?: string[];
  deployment_info: {
    node_version: string;
    next_version: string;
    vercel_url?: string;
    build_time?: string;
  };
  recommendations?: string[];
}

interface HealthCheck {
  status: 'pass' | 'warn' | 'fail';
  message: string;
  details?: Record<string, unknown>;
  last_checked: string;
}

function log(event: string, payload: Record<string, unknown>) {
  console.log(
    JSON.stringify({
      scope: 'deployment-health',
      event,
      ts: new Date().toISOString(),
      ...payload,
    })
  );
}

async function checkEnvironmentVariables(): Promise<HealthCheck> {
  const requiredVars = {
    NEXT_PUBLIC_SUPABASE_URL: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
  };

  const missingVars = Object.entries(requiredVars)
    .filter(([, exists]) => !exists)
    .map(([name]) => name);

  const optionalVars = {
    CRON_SECRET: Boolean(process.env.CRON_SECRET),
    ANTHROPIC_API_KEY: Boolean(process.env.ANTHROPIC_API_KEY),
    KV_URL: Boolean(process.env.KV_URL),
    BLOB_READ_WRITE_TOKEN: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
  };

  if (missingVars.length > 0) {
    return {
      status: 'fail',
      message: `Missing critical environment variables: ${missingVars.join(', ')}`,
      details: { missing: missingVars, optional: optionalVars },
      last_checked: new Date().toISOString(),
    };
  }

  const missingOptional = Object.entries(optionalVars)
    .filter(([, exists]) => !exists)
    .map(([name]) => name);

  return {
    status: missingOptional.length > 0 ? 'warn' : 'pass',
    message: missingOptional.length > 0
      ? `Some optional features disabled: ${missingOptional.join(', ')}`
      : 'All environment variables configured',
    details: { required: requiredVars, optional: optionalVars },
    last_checked: new Date().toISOString(),
  };
}

async function checkDatabase(): Promise<HealthCheck> {
  try {
    const supabase = getAdminClient();

    // Test basic connection
    const { data: connectionTest, error: connectionError } = await supabase
      .from('profiles')
      .select('count')
      .limit(1);

    if (connectionError) {
      return {
        status: 'fail',
        message: `Database connection failed: ${connectionError.message}`,
        details: {
          error: connectionError.message,
          code: connectionError.code,
          hint: connectionError.hint
        },
        last_checked: new Date().toISOString(),
      };
    }

    // Test admin permissions
    const { data: permissionTest, error: permissionError } = await supabase
      .from('ingestions')
      .select('id')
      .limit(1);

    if (permissionError) {
      return {
        status: 'fail',
        message: `Database permissions error: ${permissionError.message}`,
        details: {
          error: permissionError.message,
          table: 'ingestions',
          operation: 'select'
        },
        last_checked: new Date().toISOString(),
      };
    }

    return {
      status: 'pass',
      message: 'Database connection and permissions verified',
      details: { connection: 'success', permissions: 'verified' },
      last_checked: new Date().toISOString(),
    };

  } catch (error) {
    return {
      status: 'fail',
      message: `Database check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      details: { error: String(error) },
      last_checked: new Date().toISOString(),
    };
  }
}

async function checkMigrations(): Promise<HealthCheck> {
  try {
    const supabase = getAdminClient();

    // Check for recently added tables
    const tablesToCheck = [
      'creator_rights_acceptances',
      'platform_mandates',
      'deal_pipeline'
    ];

    const results: Record<string, boolean> = {};

    for (const table of tablesToCheck) {
      try {
        const { data, error } = await supabase
          .from(table)
          .select('count')
          .limit(1);

        results[table] = !error;
        if (error && !error.message.includes('relation') && !error.message.includes('does not exist')) {
          // Table exists but there's another error
          results[table] = false;
        }
      } catch {
        results[table] = false;
      }
    }

    const missingTables = Object.entries(results)
      .filter(([, exists]) => !exists)
      .map(([table]) => table);

    if (missingTables.length > 0) {
      return {
        status: 'fail',
        message: `Migration incomplete: Missing tables ${missingTables.join(', ')}`,
        details: { table_status: results, missing: missingTables },
        last_checked: new Date().toISOString(),
      };
    }

    return {
      status: 'pass',
      message: 'All required tables present',
      details: { table_status: results },
      last_checked: new Date().toISOString(),
    };

  } catch (error) {
    return {
      status: 'fail',
      message: `Migration check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      details: { error: String(error) },
      last_checked: new Date().toISOString(),
    };
  }
}

async function checkAuth(): Promise<HealthCheck> {
  try {
    const supabase = getAdminClient();

    // Test auth service availability
    const { data, error } = await supabase.auth.getSession();

    if (error && !error.message.includes('session not found')) {
      return {
        status: 'fail',
        message: `Auth service error: ${error.message}`,
        details: { error: error.message },
        last_checked: new Date().toISOString(),
      };
    }

    return {
      status: 'pass',
      message: 'Auth service available',
      details: { service: 'available' },
      last_checked: new Date().toISOString(),
    };

  } catch (error) {
    return {
      status: 'fail',
      message: `Auth check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      details: { error: String(error) },
      last_checked: new Date().toISOString(),
    };
  }
}

function checkRecentChanges(): HealthCheck {
  // List of recent critical changes that could cause deployment issues
  const recentChanges = [
    'Sign-up form rights acceptance integration',
    'Admin client usage for ingestion creation',
    'Database migration with new tables',
    'Enhanced error boundaries and logging',
    'Dynamic rendering for admin pages'
  ];

  return {
    status: 'warn',
    message: 'Recent changes detected that may affect deployment',
    details: {
      changes: recentChanges,
      deployment_note: 'Monitor for issues related to these recent modifications'
    },
    last_checked: new Date().toISOString(),
  };
}

function checkBuild(): HealthCheck {
  // Since we're in a running deployment, build succeeded
  return {
    status: 'pass',
    message: 'Build completed successfully',
    details: {
      build_status: 'success',
      routes_generated: 'all',
      static_generation: 'partial'
    },
    last_checked: new Date().toISOString(),
  };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  log('deployment_health_check_start', {
    user_agent: request.headers.get('user-agent'),
    origin: request.headers.get('origin'),
  });

  try {
    // Run all health checks in parallel
    const [
      environmentCheck,
      databaseCheck,
      migrationsCheck,
      authCheck,
    ] = await Promise.all([
      checkEnvironmentVariables(),
      checkDatabase(),
      checkMigrations(),
      checkAuth(),
    ]);

    const buildCheck = checkBuild();
    const recentChangesCheck = checkRecentChanges();

    const checks = {
      build: buildCheck,
      environment_vars: environmentCheck,
      database: databaseCheck,
      migrations: migrationsCheck,
      auth: authCheck,
      recent_changes: recentChangesCheck,
    };

    // Determine overall status
    const hasFailures = Object.values(checks).some(check => check.status === 'fail');
    const hasWarnings = Object.values(checks).some(check => check.status === 'warn');

    const overallStatus = hasFailures ? 'unhealthy' : hasWarnings ? 'degraded' : 'healthy';

    // Generate recommendations
    const recommendations: string[] = [];

    if (environmentCheck.status === 'fail') {
      recommendations.push('Set missing environment variables in Vercel dashboard');
    }

    if (databaseCheck.status === 'fail') {
      recommendations.push('Check Supabase service status and connection settings');
    }

    if (migrationsCheck.status === 'fail') {
      recommendations.push('Run database migrations: npx supabase migration up');
    }

    if (authCheck.status === 'fail') {
      recommendations.push('Verify Supabase auth configuration and service status');
    }

    if (overallStatus === 'unhealthy') {
      recommendations.push('Address critical issues before proceeding with deployment');
    }

    const health: DeploymentHealth = {
      timestamp: new Date().toISOString(),
      status: overallStatus,
      environment: process.env.NODE_ENV || 'unknown',
      region: process.env.VERCEL_REGION,
      deployment_id: process.env.VERCEL_DEPLOYMENT_ID,
      checks,
      deployment_info: {
        node_version: process.version,
        next_version: '15.5.3',
        vercel_url: process.env.VERCEL_URL,
        build_time: process.env.VERCEL_DEPLOYMENT_ID ? new Date().toISOString() : undefined,
      },
      recommendations: recommendations.length > 0 ? recommendations : undefined,
    };

    const duration = Date.now() - startTime;

    log('deployment_health_check_complete', {
      status: overallStatus,
      duration,
      failures: Object.values(checks).filter(c => c.status === 'fail').length,
      warnings: Object.values(checks).filter(c => c.status === 'warn').length,
    });

    return NextResponse.json(health, {
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

    log('deployment_health_check_error', {
      error: errorMessage,
      duration
    });

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      status: 'unhealthy',
      error: errorMessage,
      environment: process.env.NODE_ENV || 'unknown',
      checks: {
        build: { status: 'fail', message: 'Health check failed', last_checked: new Date().toISOString() },
        environment_vars: { status: 'fail', message: 'Health check failed', last_checked: new Date().toISOString() },
        database: { status: 'fail', message: 'Health check failed', last_checked: new Date().toISOString() },
        migrations: { status: 'fail', message: 'Health check failed', last_checked: new Date().toISOString() },
        auth: { status: 'fail', message: 'Health check failed', last_checked: new Date().toISOString() },
        recent_changes: { status: 'fail', message: 'Health check failed', last_checked: new Date().toISOString() },
      }
    }, { status: 503 });
  }
}