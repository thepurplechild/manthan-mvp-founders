import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'

export async function GET(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const rl = rateLimit(`pipeline-status:${ip}`, 60, 2000)
  if (!rl.allowed) return NextResponse.json({ code: 'rate_limited', retryAfter: rl.retryAfter }, { status: 429 })

  const url = new URL(req.url)
  const projectId = url.searchParams.get('projectId') || undefined
  const ingestionId = url.searchParams.get('ingestionId') || undefined
  if (!projectId && !ingestionId) return NextResponse.json({ code: 'bad_request', message: 'projectId or ingestionId required' }, { status: 400 })

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ code: 'unauthorized' }, { status: 401 })

  let ingestion: Record<string, unknown> | null = null
  if (ingestionId) {
    const { data } = await supabase.from('ingestions').select('*').eq('id', ingestionId).single()
    ingestion = data
  } else if (projectId) {
    const { data } = await supabase
      .from('ingestions')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    ingestion = data
  }
  if (!ingestion) return NextResponse.json({ code: 'not_found', message: 'No ingestion' }, { status: 404 })

  const { data: steps } = await supabase
    .from('ingestion_steps')
    .select('*')
    .eq('ingestion_id', ingestion.id)
    .order('started_at', { ascending: true })

  const { data: assets } = await supabase
    .from('generated_assets')
    .select('*')
    .eq('project_id', ingestion.project_id)
    .order('created_at', { ascending: false })

  // Map to client-friendly structure
  const mapStep = (s: Record<string, unknown>) => ({
    name: s.name,
    status: s.status,
    startedAt: s.started_at,
    finishedAt: s.finished_at,
    output: s.output,
    error: s.error,
  })

  const result = {
    ingestionId: ingestion.id,
    projectId: ingestion.project_id,
    status: ingestion.status,
    progress: ingestion.progress,
    steps: (steps || []).map(mapStep),
    assets: assets || [],
  }
  return NextResponse.json({ ok: true, data: result })
}
