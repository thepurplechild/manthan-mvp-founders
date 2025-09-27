import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';

function log(event: string, payload: Record<string, unknown>) {
  console.log(
    JSON.stringify({
      scope: 'debug-cron',
      event,
      ts: new Date().toISOString(),
      ...payload,
    })
  );
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  log('debug_cron_test_start', {
    url: request.url,
    user_agent: request.headers.get('user-agent'),
  });

  const tests = {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    region: process.env.VERCEL_REGION || 'unknown',
    tests: {} as Record<string, any>
  };

  // Test 1: Check if we can reach the cron endpoint
  try {
    const origin = new URL(request.url).origin;
    const cronUrl = `${origin}/api/cron/process-jobs`;

    log('testing_cron_endpoint_reachability', { url: cronUrl });

    const cronResponse = await fetch(cronUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-cron-secret': process.env.CRON_SECRET || 'test-secret',
      },
    });

    const cronText = await cronResponse.text();

    tests.tests.cron_endpoint = {
      reachable: true,
      status: cronResponse.status,
      ok: cronResponse.ok,
      response_size: cronText.length,
      response_preview: cronText.slice(0, 200),
    };

    log('cron_endpoint_test_complete', {
      status: cronResponse.status,
      ok: cronResponse.ok,
    });

  } catch (error) {
    tests.tests.cron_endpoint = {
      reachable: false,
      error: error instanceof Error ? error.message : String(error),
    };

    log('cron_endpoint_test_failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Test 2: Check Supabase admin client functionality
  try {
    log('testing_supabase_admin_client', {});

    const supabase = getAdminClient();

    // Test basic connection
    const { data: connectionTest, error: connectionError } = await supabase
      .from('ingestions')
      .select('count')
      .limit(1);

    if (connectionError) {
      throw new Error(`Connection failed: ${connectionError.message}`);
    }

    // Test if we can query ingestions
    const { data: ingestions, error: queryError } = await supabase
      .from('ingestions')
      .select('id, status, created_at')
      .order('created_at', { ascending: false })
      .limit(5);

    if (queryError) {
      throw new Error(`Query failed: ${queryError.message}`);
    }

    // Test if we can call RPC functions
    let rpcTestResult = null;
    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc('acquire_processing_lock', {
        p_lock_id: 'debug-test-lock',
        p_locked_by: 'debug-test',
        p_timeout_minutes: 1,
      });

      if (!rpcError) {
        // Release the lock immediately
        await supabase.rpc('release_processing_lock', {
          p_lock_id: 'debug-test-lock',
        });
        rpcTestResult = { success: true, acquired: Boolean(rpcData) };
      } else {
        rpcTestResult = { success: false, error: rpcError.message };
      }
    } catch (rpcError) {
      rpcTestResult = { success: false, error: String(rpcError) };
    }

    tests.tests.supabase_admin = {
      connection: 'success',
      can_query_ingestions: true,
      ingestion_count: ingestions?.length || 0,
      recent_ingestions: ingestions?.map(i => ({
        id: i.id,
        status: i.status,
        created_at: i.created_at
      })) || [],
      rpc_functions: rpcTestResult,
    };

    log('supabase_admin_test_complete', {
      connection: 'success',
      ingestion_count: ingestions?.length || 0,
    });

  } catch (error) {
    tests.tests.supabase_admin = {
      connection: 'failed',
      error: error instanceof Error ? error.message : String(error),
    };

    log('supabase_admin_test_failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Test 3: Check environment variables
  tests.tests.environment_vars = {
    CRON_SECRET: Boolean(process.env.CRON_SECRET),
    NEXT_PUBLIC_SUPABASE_URL: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    ANTHROPIC_API_KEY: Boolean(process.env.ANTHROPIC_API_KEY),
    KV_URL: Boolean(process.env.KV_URL),
    BLOB_READ_WRITE_TOKEN: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
  };

  // Test 4: Check for stuck ingestions
  try {
    const supabase = getAdminClient();
    const { data: stuckIngestions } = await supabase
      .from('ingestions')
      .select('id, status, created_at, updated_at')
      .eq('status', 'queued')
      .order('created_at', { ascending: true });

    const now = Date.now();
    const stuckJobs = stuckIngestions?.filter(ingestion => {
      const ageMinutes = (now - new Date(ingestion.created_at).getTime()) / (1000 * 60);
      return ageMinutes > 5; // Consider stuck if queued for more than 5 minutes
    }) || [];

    tests.tests.stuck_ingestions = {
      total_queued: stuckIngestions?.length || 0,
      stuck_count: stuckJobs.length,
      stuck_jobs: stuckJobs.map(job => ({
        id: job.id,
        age_minutes: Math.round((now - new Date(job.created_at).getTime()) / (1000 * 60)),
        created_at: job.created_at,
      })),
    };

    log('stuck_ingestions_check_complete', {
      total_queued: stuckIngestions?.length || 0,
      stuck_count: stuckJobs.length,
    });

  } catch (error) {
    tests.tests.stuck_ingestions = {
      error: error instanceof Error ? error.message : String(error),
    };
  }

  // Overall health assessment
  const hasErrors = Object.values(tests.tests).some(test =>
    test.error || test.connection === 'failed' || !test.reachable
  );

  const overallStatus = hasErrors ? 'unhealthy' : 'healthy';

  log('debug_cron_test_complete', {
    overall_status: overallStatus,
    has_errors: hasErrors,
  });

  return NextResponse.json({
    ...tests,
    overall_status: overallStatus,
  }, {
    status: hasErrors ? 500 : 200,
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    }
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Allow manual trigger of cron job for testing
  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'trigger_cron') {
      const origin = new URL(request.url).origin;
      const cronUrl = `${origin}/api/cron/process-jobs`;

      log('manual_cron_trigger', { url: cronUrl });

      const cronResponse = await fetch(cronUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-cron-secret': process.env.CRON_SECRET || '',
        },
      });

      const cronResult = await cronResponse.text();

      return NextResponse.json({
        triggered: true,
        status: cronResponse.status,
        response: cronResult.slice(0, 1000), // Truncate for readability
      });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });

  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to trigger cron',
    }, { status: 500 });
  }
}