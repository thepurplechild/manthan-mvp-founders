import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import pRetry from 'p-retry'
import { rateLimit } from '@/lib/rate-limit'
import { createClient } from '@/lib/supabase/server'
import { ingestFile } from '@/lib/ingestion/core'
import { stepExtractElements, stepGenerateCharacters, stepMarketAdaptation, stepPitchContent, stepVisualConcepts } from '@/lib/ai/steps'
import type { CoreElements, CharactersResult, MarketAdaptation, PitchContent, VisualConcepts } from '@/types/pipeline'

const Body = z.object({
  ingestionId: z.string().optional(),
  projectId: z.string().optional(),
  forceReprocess: z.boolean().optional(),
  options: z.object({ targetPlatform: z.string().optional(), tone: z.string().optional() }).optional(),
})

async function updateStep(supabase: import('@supabase/supabase-js').SupabaseClient, ingestionId: string, name: string, patch: Record<string, unknown>) {
  await supabase.from('ingestion_steps').upsert({ ingestion_id: ingestionId, name, ...patch }, { onConflict: 'ingestion_id,name' })
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const rl = rateLimit(`orchestrator:${ip}`, 5, 60000)
  if (!rl.allowed) return NextResponse.json({ code: 'rate_limited', message: 'Too many requests', hint: `Retry in ${Math.ceil(rl.retryAfter/1000)}s` }, { status: 429 })

  const body = Body.safeParse(await req.json())
  if (!body.success) return NextResponse.json({ code: 'bad_request', message: 'Invalid payload', hint: body.error.issues.map(i=>i.message).join('; ') }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ code: 'unauthorized', message: 'Sign in required' }, { status: 401 })

  // Resolve ingestion record
  let ingestion: Record<string, unknown> | null = null
  if (body.data.ingestionId) {
    const { data } = await supabase.from('ingestions').select('*').eq('id', body.data.ingestionId).single()
    ingestion = data
  } else if (body.data.projectId) {
    const { data } = await supabase.from('ingestions').select('*').eq('project_id', body.data.projectId).order('created_at', { ascending: false }).limit(1).maybeSingle()
    ingestion = data
  }
  if (!ingestion) return NextResponse.json({ code: 'not_found', message: 'No ingestion found for processing' }, { status: 404 })

  // Download file
  const path: string = String(ingestion.source_file_url)
  const dl = await supabase.storage.from('scripts').download(path)
  if (dl.error) return NextResponse.json({ code: 'download_failed', message: dl.error.message }, { status: 500 })
  const buffer = Buffer.from(await dl.data.arrayBuffer())

  // Parse to text using existing ingestion engine
  const parsed = await ingestFile(path.split('/').pop() || 'script', buffer, undefined, { extractMetadata: true })
  const scriptText = parsed.content?.textContent || ''
  if (!scriptText) return NextResponse.json({ code: 'empty_script', message: 'No text content found after parsing' }, { status: 400 })

  // Progress helpers
  await supabase.from('ingestions').update({ status: 'running', progress: 5 }).eq('id', ingestion.id as string)

  const run = <T>(name: string, fn: () => Promise<T>) => pRetry(async () => {
    await updateStep(supabase, ingestion.id as string, name, { status: 'running', started_at: new Date().toISOString() })
    try {
      const res = await fn()
      await updateStep(supabase, ingestion.id as string, name, { status: 'succeeded', finished_at: new Date().toISOString(), output: res as unknown as import('@/types/common').JSONObject })
      // Persist step output for project history
      if (ingestion.project_id) {
        await supabase.from('generated_content').insert({ project_id: ingestion.project_id as string, step: name, payload: res as unknown as import('@/types/common').JSONObject })
      }
      return res
    } catch (err: unknown) {
      await updateStep(supabase, ingestion.id as string, name, { status: 'failed', finished_at: new Date().toISOString(), error: err instanceof Error ? err.message : String(err) })
      throw err
    }
  }, { retries: 2, factor: 2, minTimeout: 400, maxTimeout: 1500 })

  try {
    // a) Core Elements
    const core: CoreElements = await run('core_extraction', () => stepExtractElements(scriptText))
    await supabase.from('ingestions').update({ progress: 25 }).eq('id', ingestion.id)

    // b) Characters
    const characters: CharactersResult = await run('character_bible', () => stepGenerateCharacters(core))
    await supabase.from('ingestions').update({ progress: 45 }).eq('id', ingestion.id)

    // c) Market Adaptation
    const market: MarketAdaptation = await run('market_adaptation', () => stepMarketAdaptation(core, characters, body.data.options))
    await supabase.from('ingestions').update({ progress: 60 }).eq('id', ingestion.id)

    // d) Pitch Deck Content
    const pitch: PitchContent = await run('package_assembly', () => stepPitchContent(core, market, characters))
    await supabase.from('ingestions').update({ progress: 78 }).eq('id', ingestion.id)

    // e) Visual Concepts
    const visuals: VisualConcepts = await run('visuals', () => stepVisualConcepts(core, characters))
    await supabase.from('ingestions').update({ progress: 90 }).eq('id', ingestion.id)

    // f) Document Assembly trigger (client can call /api/generate-documents)
    await updateStep(supabase, ingestion.id as string, 'final_package', { status: 'queued', output: { ready: true, core, characters, market, pitch, visuals } })
    await supabase.from('ingestions').update({ status: 'succeeded', progress: 95 }).eq('id', ingestion.id)
    // Update project rollups
    if (ingestion.project_id) {
      const quality = computeQualityScore(core, characters)
      await supabase.from('projects').update({ processing_status: 'completed', quality_score: quality, last_run_at: new Date().toISOString() }).eq('id', ingestion.project_id)
    }

    return NextResponse.json({ ok: true, ingestionId: ingestion.id, results: { core, characters, market, pitch, visuals } })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    await supabase.from('ingestions').update({ status: 'failed', error: msg }).eq('id', ingestion?.id as string)
    return NextResponse.json({ code: 'orchestrator_failed', message: msg, retriable: true }, { status: 500 })
  }
}

function computeQualityScore(core: CoreElements, chars: CharactersResult): number {
  let score = 0
  if (core.logline && core.logline.length > 20) score += 0.3
  if (core.synopsis && core.synopsis.length > 200) score += 0.3
  if (chars.characters && chars.characters.length >= 3) score += 0.2
  if (core.themes && core.themes.length > 0) score += 0.1
  if (core.genres && core.genres.length > 0) score += 0.1
  return Math.min(1, Number(score.toFixed(2)))
}
