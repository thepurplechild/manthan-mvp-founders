import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';

function log(event: string, payload: Record<string, unknown>) {
  console.log(
    JSON.stringify({
      scope: 'migration-status',
      event,
      ts: new Date().toISOString(),
      ...payload,
    })
  );
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  log('migration_status_check_start', {
    user_agent: request.headers.get('user-agent'),
  });

  try {
    const supabase = getAdminClient();

    // Test the new tables from recent migrations
    const tablesToCheck = [
      'creator_rights_acceptances',
      'platform_mandates',
      'deal_pipeline',
      'ingestions',
      'profiles'
    ];

    const results: Record<string, any> = {};

    for (const tableName of tablesToCheck) {
      try {
        log('checking_table', { table: tableName });

        // Try to query the table structure
        const { data, error } = await supabase
          .from(tableName)
          .select('*')
          .limit(1);

        if (error) {
          results[tableName] = {
            status: 'error',
            message: error.message,
            code: error.code,
            hint: error.hint,
          };
        } else {
          results[tableName] = {
            status: 'exists',
            message: 'Table accessible',
            record_count: data ? data.length : 0,
          };
        }

      } catch (err) {
        results[tableName] = {
          status: 'exception',
          message: err instanceof Error ? err.message : 'Unknown error',
        };
      }
    }

    // Test specific functionality that might be failing
    const functionalityTests: Record<string, any> = {};

    // Test 1: Can we create a rights acceptance record?
    try {
      const testUserId = '00000000-0000-0000-0000-000000000000'; // placeholder UUID
      const { data: testInsert, error: insertError } = await supabase
        .from('creator_rights_acceptances')
        .insert({
          user_id: testUserId,
          version: 'test-migration-check',
          accepted_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (insertError) {
        functionalityTests.rights_acceptance_insert = {
          status: 'error',
          message: insertError.message,
          code: insertError.code,
        };
      } else {
        functionalityTests.rights_acceptance_insert = {
          status: 'success',
          message: 'Can insert records',
          inserted_id: testInsert?.id,
        };

        // Clean up test record
        if (testInsert?.id) {
          await supabase
            .from('creator_rights_acceptances')
            .delete()
            .eq('id', testInsert.id);
        }
      }
    } catch (err) {
      functionalityTests.rights_acceptance_insert = {
        status: 'exception',
        message: err instanceof Error ? err.message : 'Unknown error',
      };
    }

    // Test 2: Can we call the RPC function?
    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc('record_rights_acceptance', {
        p_user_id: '00000000-0000-0000-0000-000000000000',
        p_version: 'test-rpc-check',
      });

      if (rpcError) {
        functionalityTests.rpc_function = {
          status: 'error',
          message: rpcError.message,
          code: rpcError.code,
        };
      } else {
        functionalityTests.rpc_function = {
          status: 'success',
          message: 'RPC function accessible',
          result: rpcData,
        };

        // Clean up test record if created
        if (rpcData) {
          await supabase
            .from('creator_rights_acceptances')
            .delete()
            .eq('id', rpcData);
        }
      }
    } catch (err) {
      functionalityTests.rpc_function = {
        status: 'exception',
        message: err instanceof Error ? err.message : 'Unknown error',
      };
    }

    // Determine overall migration status
    const failedTables = Object.entries(results)
      .filter(([, result]) => result.status === 'error' || result.status === 'exception')
      .map(([table]) => table);

    const overallStatus = failedTables.length === 0 ? 'success' : 'incomplete';

    const response = {
      timestamp: new Date().toISOString(),
      migration_status: overallStatus,
      environment: process.env.NODE_ENV,
      database_url_configured: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
      service_role_configured: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      table_checks: results,
      functionality_tests: functionalityTests,
      failed_tables: failedTables,
      recommendations: failedTables.length > 0 ? [
        'Run database migrations: npx supabase migration up',
        'Check Supabase project settings and database configuration',
        'Verify all migration files have been applied',
      ] : ['All migrations appear to have been applied successfully'],
    };

    log('migration_status_check_complete', {
      status: overallStatus,
      failed_tables: failedTables.length,
      functionality_tests_passed: Object.values(functionalityTests).filter(t => t.status === 'success').length,
    });

    return NextResponse.json(response, {
      status: overallStatus === 'success' ? 200 : 500,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      }
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    log('migration_status_check_error', {
      error: errorMessage,
    });

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      migration_status: 'error',
      error: errorMessage,
      recommendations: [
        'Check database connection',
        'Verify environment variables',
        'Check Supabase service status',
      ],
    }, { status: 500 });
  }
}