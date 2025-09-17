import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'

const Body = z.object({
  projectId: z.string(),
  options: z.object({ targetPlatform: z.string().optional(), tone: z.string().optional() }).optional()
})

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const rl = rateLimit(`reprocess:${ip}`, 5, 60000)
  if (!rl.allowed) return NextResponse.json({ code: 'rate_limited', message: 'Too many requests' }, { status: 429 })

  const body = Body.safeParse(await req.json())
  if (!body.success) return NextResponse.json({ code: 'bad_request', message: 'Invalid payload' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ code: 'unauthorized' }, { status: 401 })

  // Ownership check
  const { data: proj } = await supabase.from('projects').select('id, owner_id').eq('id', body.data.projectId).single()
  if (!proj || proj.owner_id !== user.id) return NextResponse.json({ code: 'forbidden' }, { status: 403 })

  // Trigger orchestrator with options
  const res = await fetch(new URL('/api/process-script', req.url), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: body.data.projectId, forceReprocess: true, options: body.data.options || {} }) })
  const json = await res.json().catch(()=>({}))
  return NextResponse.json(json, { status: res.status })
}

