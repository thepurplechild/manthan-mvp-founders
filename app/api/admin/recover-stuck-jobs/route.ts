import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

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
 * Admin-only endpoint to recover stuck ingestion jobs
 * This endpoint has service role access to modify any ingestion job
 */
export async function POST(req: NextRequest) {
  // Verify admin authentication
  if (!verifyAdminAuth(req)) {
    return NextResponse.json({ 
      error: 'Admin authentication required',
      details: 'Provide ADMIN_TOKEN in Authorization header or X-Admin-Token header'
    }, { status: 401 });
  }

  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(cookiesToSet) { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) },
        }
      }
    )

    // Get timeout threshold from request body or default to 3 minutes
    const { timeout_minutes = 3 } = await req.json().catch(() => ({}));
    const stuckThreshold = new Date(Date.now() - timeout_minutes * 60 * 1000).toISOString()
    
    console.log(`[admin] Checking for jobs stuck longer than ${timeout_minutes} minutes`)

    // Find jobs stuck in 'running' status
    const { data: stuckJobs, error: queryError } = await supabase
      .from('ingestions')
      .select('id, status, updated_at, source_file_url, user_id')
      .eq('status', 'running')
      .lt('updated_at', stuckThreshold)

    if (queryError) {
      throw new Error(`Failed to query stuck jobs: ${queryError.message}`)
    }

    if (!stuckJobs || stuckJobs.length === 0) {
      return NextResponse.json({ 
        success: true,
        message: 'No stuck jobs found',
        recovered_count: 0,
        threshold: stuckThreshold
      });
    }

    console.log(`[admin] Found ${stuckJobs.length} stuck jobs, requeuing...`)
    
    // Mark stuck jobs as queued for retry
    const { error: updateError } = await supabase
      .from('ingestions')
      .update({ 
        status: 'queued',
        error: `Job timeout - automatically requeued by admin after ${timeout_minutes} minutes`,
        updated_at: new Date().toISOString()
      })
      .in('id', stuckJobs.map(job => job.id))

    if (updateError) {
      throw new Error(`Failed to update stuck jobs: ${updateError.message}`)
    }
    
    console.log(`[admin] Successfully requeued ${stuckJobs.length} stuck ingestion jobs`)

    return NextResponse.json({ 
      success: true,
      message: `Successfully recovered ${stuckJobs.length} stuck jobs`,
      recovered_count: stuckJobs.length,
      recovered_jobs: stuckJobs.map(job => ({
        id: job.id,
        user_id: job.user_id,
        was_stuck_since: job.updated_at
      })),
      threshold: stuckThreshold
    });

  } catch (error) {
    console.error('[admin] Error recovering stuck jobs:', error)
    return NextResponse.json({ 
      error: 'Failed to recover stuck jobs',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

/**
 * GET endpoint to check for stuck jobs without modifying them
 */
export async function GET(req: NextRequest) {
  // Verify admin authentication
  if (!verifyAdminAuth(req)) {
    return NextResponse.json({ 
      error: 'Admin authentication required',
      details: 'Provide ADMIN_TOKEN in Authorization header or X-Admin-Token header'
    }, { status: 401 });
  }

  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(cookiesToSet) { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) },
        }
      }
    )

    // Check for jobs stuck for more than 3 minutes
    const stuckThreshold = new Date(Date.now() - 3 * 60 * 1000).toISOString()
    
    const { data: stuckJobs, error } = await supabase
      .from('ingestions')
      .select('id, status, updated_at, source_file_url, user_id, created_at')
      .eq('status', 'running')
      .lt('updated_at', stuckThreshold)

    if (error) {
      throw new Error(`Failed to query stuck jobs: ${error.message}`)
    }

    return NextResponse.json({ 
      success: true,
      stuck_jobs_count: stuckJobs?.length || 0,
      stuck_jobs: stuckJobs || [],
      threshold: stuckThreshold
    });

  } catch (error) {
    console.error('[admin] Error checking stuck jobs:', error)
    return NextResponse.json({ 
      error: 'Failed to check stuck jobs',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}