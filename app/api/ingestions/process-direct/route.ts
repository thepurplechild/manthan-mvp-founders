import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { rateLimit } from '@/lib/rate-limit'
import { POST as processIngestion } from '../run/route'

/**
 * Direct processing endpoint that bypasses the KV queue
 * This is a fallback when the cron job system is not working
 * 
 * SECURITY NOTE: This endpoint only processes user-owned ingestions.
 * Stuck job recovery has been moved to admin-only endpoint for security.
 */
export async function POST(req: NextRequest) {

  // Rate limiting: max 5 direct processing attempts per minute per IP
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const rl = rateLimit(`direct-process:${ip}`, 5, 60000)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many retry attempts. Please wait.' }, { 
      status: 429, 
      headers: { 'Retry-After': String(Math.ceil(rl.retryAfter/1000)) } 
    })
  }

  try {
    const { ingestion_id } = await req.json()
    if (!ingestion_id) {
      return NextResponse.json({ error: 'Missing ingestion_id' }, { status: 400 })
    }

    // Idempotence: Check if ingestion is still in queued state
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(cookiesToSet) { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) },
        }
      }
    )

    // Quick status check for idempotence
    const { data: statusCheck } = await supabase
      .from('ingestions')
      .select('status')
      .eq('id', ingestion_id)
      .single()

    if (statusCheck && statusCheck.status !== 'queued') {
      return NextResponse.json({ 
        error: `Ingestion is no longer queued (status: ${statusCheck.status})`,
        current_status: statusCheck.status 
      }, { status: 400 })
    }

    // Get the current user to verify ownership
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if ingestion exists and user owns it
    const { data: ingestion, error } = await supabase
      .from('ingestions')
      .select('*')
      .eq('id', ingestion_id)
      .eq('user_id', user.id) // Explicit ownership check
      .single()

    if (error || !ingestion) {
      return NextResponse.json({ error: 'Ingestion not found or access denied' }, { status: 404 })
    }

    // Final check - only process if it's stuck in queued status
    if (ingestion.status !== 'queued') {
      return NextResponse.json({ 
        error: `Ingestion is not queued (current status: ${ingestion.status})`,
        current_status: ingestion.status 
      }, { status: 400 })
    }

    console.log(`[direct-process] Processing stuck ingestion ${ingestion_id} directly for user ${user.id}`)

    // Call the ingestion/run handler directly (internal function composition)
    const runRequest = new NextRequest(req.nextUrl.origin, {
      method: 'POST',
      headers: req.headers,
      body: JSON.stringify({ ingestion_id })
    })

    const result = await processIngestion(runRequest)
    
    if (!result.ok) {
      const errorText = await result.text()
      console.error(`[direct-process] Failed to process ingestion ${ingestion_id}:`, errorText)
      return NextResponse.json({ 
        error: 'Failed to process ingestion',
        details: errorText 
      }, { status: 500 })
    }

    console.log(`[direct-process] Successfully processed ingestion ${ingestion_id}`)

    return NextResponse.json({ 
      success: true, 
      message: `Ingestion ${ingestion_id} processed successfully`
    })

  } catch (error) {
    console.error('[direct-process] Error:', error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 })
  }
}