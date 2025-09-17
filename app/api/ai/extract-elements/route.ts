import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { rateLimit } from '@/lib/rate-limit'
import { createClient } from '@/lib/supabase/server'
import { stepExtractElements } from '@/lib/ai/steps'
import type { CoreElements } from '@/types/pipeline'

const Body = z.object({
  projectId: z.string().optional(),
  ingestionId: z.string().optional(),
  text: z.string().optional(),
  forceReprocess: z.boolean().optional(),
})

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const rl = rateLimit(`ai:elements:${ip}`, 20, 60000)
  if (!rl.allowed) return NextResponse.json({ code: 'rate_limited', message: 'Too many requests', hint: `Retry in ${Math.ceil(rl.retryAfter/1000)}s` }, { status: 429 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ code: 'unauthorized', message: 'Sign in required' }, { status: 401 })

  const body = Body.safeParse(await req.json())
  if (!body.success) return NextResponse.json({ code: 'bad_request', message: 'Invalid payload', hint: body.error.issues.map(i=>i.message).join('; ') }, { status: 400 })

  // If text not provided, caller should orchestrate fetch/ingestion. This endpoint just processes text.
  const text = body.data.text || ''
  if (!text) return NextResponse.json({ code: 'bad_request', message: 'Missing text to process' }, { status: 400 })

  try {
    const core: CoreElements = await stepExtractElements(text)
    return NextResponse.json({ ok: true, result: core })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ code: 'ai_failed', message: msg, retriable: true }, { status: 500 })
  }
}
