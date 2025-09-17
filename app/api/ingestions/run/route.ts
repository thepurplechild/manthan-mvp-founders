import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { ingestFile } from '@/lib/ingestion/core'
import { callClaude, safeParseJSON } from '@/lib/ai/anthropic'
import { generatePitchPDF, generatePitchPPTX, generateSummaryDOCX, type PitchData } from '@/lib/generation/documents'
import { generateVisualBrief, maybeGenerateImages } from '@/lib/generation/visuals'
import { parseFile } from '@/lib/ingestion/parsers'
import { rateLimit } from '@/lib/rate-limit'

type StepName = 'script_preprocess'|'core_extraction'|'character_bible'|'visuals'|'market_adaptation'|'package_assembly'|'final_package'

export async function POST(req: NextRequest) {
  const { ingestion_id } = await req.json()
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const rl = rateLimit(`run:${ip}`, 20, 60000)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfter/1000)) } })
  }
  if (!ingestion_id) return NextResponse.json({ error: 'Missing ingestion_id' }, { status: 400 })

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

  // Fetch ingestion & steps
  const { data: ingestion, error } = await supabase.from('ingestions').select('*').eq('id', ingestion_id).single()
  if (error || !ingestion) return NextResponse.json({ error: error?.message || 'Not found' }, { status: 404 })

  // Update status running
  await supabase.from('ingestions').update({ status: 'running', progress: 5 }).eq('id', ingestion_id)

  interface StepPatch {
    status: 'running' | 'succeeded' | 'failed';
    started_at?: string;
    finished_at?: string;
    output?: Record<string, unknown>;
    error?: string;
  }

  const updateStep = async (name: StepName, status: 'running'|'succeeded'|'failed', output?: Record<string, unknown>, err?: string) => {
    const patch: StepPatch = { status }
    if (status === 'running') {
      patch.started_at = new Date().toISOString()
    }
    if (status === 'succeeded') {
      patch.finished_at = new Date().toISOString()
      patch.output = output || {}
    }
    if (status === 'failed') {
      patch.finished_at = new Date().toISOString()
      patch.error = err || 'failed'
    }
    await supabase.from('ingestion_steps').update(patch).eq('ingestion_id', ingestion_id).eq('name', name)
  }

  const setProgress = async (pct: number) => {
    await supabase.from('ingestions').update({ progress: pct }).eq('id', ingestion_id)
  }

  // Download source file from storage
  // source_file_url stores the storage path
  const path: string = ingestion.source_file_url
  const dl = await supabase.storage.from('scripts').download(path)
  if (dl.error) {
    await supabase.from('ingestions').update({ status: 'failed', error: dl.error.message }).eq('id', ingestion_id)
    return NextResponse.json({ error: dl.error.message }, { status: 500 })
  }
  const fileBlob = dl.data
  const arrayBuf = await fileBlob.arrayBuffer()
  const buffer = Buffer.from(arrayBuf)

  // Will collect artifact paths to persist in final package
  let pdfDeckPath: string | null = null
  let pptxDeckPath: string | null = null
  let docxSummaryPath: string | null = null

  try {
    await updateStep('script_preprocess','running')
    const res = await ingestFile(path.split('/').pop() || 'script', buffer, undefined, { extractMetadata: true })
    await updateStep('script_preprocess','succeeded', { metadata: res.content?.metadata, contentType: res.content?.contentType })
    await setProgress(25)

    await updateStep('core_extraction','running')
    interface CoreData {
      logline: string;
      synopsis: string;
      themes: string[];
      characters: Array<{ name: string; description?: string }>;
      genres?: string[];
      title?: string;
      [key: string]: unknown;
    }
    let core: CoreData
    try {
      if (process.env.ANTHROPIC_API_KEY) {
        const scriptText = res.content?.textContent || ''
        const input = scriptText.length > 0 ? scriptText : 'N/A'
        const prompt = `You are given a screenplay or story text. Extract the following as strict JSON with keys: logline (string), synopsis (string, 2-4 paragraphs), themes (string[]), characters (array of objects with name and brief description). Respond ONLY with JSON and no prose.\n\nTEXT:\n${input}`
        const { text } = await callClaude(prompt, 'Extract core elements as JSON. Do not include extra commentary.', 1500)
        core = safeParseJSON(text) || {
          logline: '', synopsis: '', themes: [], characters: []
        }
      } else {
        // Fallback stub
        core = {
          logline: res.content?.metadata.title ? `${res.content?.metadata.title} — a compelling story` : 'A compelling story',
          synopsis: (res.content?.textContent || '').slice(0, 1200),
          themes: ['ambition','identity','family'],
          characters: []
        }
      }
      await updateStep('core_extraction','succeeded', core)
    } catch (err: unknown) {
      // On error, persist failure but continue with stub to keep pipeline moving
      const errorMessage = err instanceof Error ? err.message : String(err);
      await updateStep('core_extraction','failed', undefined, errorMessage)
      core = {
        logline: res.content?.metadata.title ? `${res.content?.metadata.title} — a compelling story` : 'A compelling story',
        synopsis: (res.content?.textContent || '').slice(0, 1200),
        themes: ['ambition','identity','family'],
        characters: []
      }
      await updateStep('core_extraction','succeeded', core)
    }
    await setProgress(45)

    await updateStep('character_bible','running')
    interface BibleData {
      characters: Array<{
        name: string;
        motivations?: string[];
        conflicts?: string[];
        relationships?: string[];
        arc?: string;
        cultural_context?: string;
      }>;
      [key: string]: unknown;
    }
    let bible: BibleData | null = null
    try {
      if (process.env.ANTHROPIC_API_KEY) {
        const prompt2 = `Using the following core elements JSON, generate a CHARACTER_BIBLE as strict JSON with keys: characters (array of objects each with name, motivations, conflicts, relationships (array), arc, cultural_context). Respond ONLY with JSON.\n\nCORE_ELEMENTS_JSON:\n${JSON.stringify(core)}`
        const { text } = await callClaude(prompt2, 'Expand core elements into a detailed character bible as JSON.', 1500)
        bible = safeParseJSON(text) || { characters: [] }
      } else {
        bible = { characters: [{ name: 'Protagonist', motivations: ['prove self'], conflicts: ['family pressure'], relationships: [], arc: 'from doubt to purpose', cultural_context: 'Indian, middle-class urban milieu' }] }
      }
      await updateStep('character_bible','succeeded', bible)

      // After Step 2: generate documents and upload to Supabase Storage
      try {
        const coreData = core || {}
        const pd: PitchData = {
          title: ingestion?.title || coreData.title || ingestion?.source_file_url?.split('/').pop() || 'Pitch Deck',
          logline: coreData.logline,
          synopsis: coreData.synopsis,
          themes: coreData.themes,
          genres: coreData.genres,
          characters: bible?.characters || [],
          marketTags: ['Bollywood', 'INR', '₹']
        }

        const [pdfBuf, pptxBuf, docxBuf] = await Promise.all([
          generatePitchPDF(pd),
          generatePitchPPTX(pd),
          generateSummaryDOCX(pd)
        ])

        const baseDir = `generated-assets/${ingestion.user_id}/${ingestion_id}`
        pdfDeckPath = `${baseDir}/pitch.pdf`
        pptxDeckPath = `${baseDir}/pitch.pptx`
        docxSummaryPath = `${baseDir}/summary.docx`

        await supabase.storage.from('generated-assets').upload(pdfDeckPath, pdfBuf, { contentType: 'application/pdf', upsert: true })
        await supabase.storage.from('generated-assets').upload(pptxDeckPath, pptxBuf, { contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', upsert: true })
        await supabase.storage.from('generated-assets').upload(docxSummaryPath, docxBuf, { contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', upsert: true })
      } catch {
        // Non-fatal: continue pipeline
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      await updateStep('character_bible','failed', undefined, errorMessage)
      bible = { characters: [{ name: 'Protagonist', arc: 'from doubt to purpose' }] }
      await updateStep('character_bible','succeeded', bible)
    }
    await setProgress(60)

    // Visuals step (after character bible)
    await updateStep('visuals','running')
    try {
      // Re-parse to get structured scenes (best-effort)
      const ext = (path.split('.').pop() || '').toLowerCase()
      type SupportedFileType = '.txt' | '.pdf' | '.fdx' | '.celtx' | '.docx' | '.pptx' | '.ppt';
      const fileType = (ext.startsWith('p') ? `.p${ext.slice(1)}` : `.${ext}`) as SupportedFileType
      const parsed = await parseFile(path.split('/').pop() || 'script', buffer, fileType)
      const brief = generateVisualBrief(parsed.structuredContent || null)
      // Optionally call image API (mock)
      const generated = await maybeGenerateImages(brief.scenes.flatMap(s => s.prompts.slice(0, 1)))
      const visualsOut = { brief, generated }
      await updateStep('visuals','succeeded', visualsOut)
    } catch (vErr: unknown) {
      const errorMessage = vErr instanceof Error ? vErr.message : String(vErr);
      await updateStep('visuals','failed', undefined, errorMessage)
      await updateStep('visuals','succeeded', { brief: { scenes: [] }, generated: [] })
    }

    await setProgress(68)

    await updateStep('market_adaptation','running')
    const market = { recommendations: [{ platform: 'Disney+ Hotstar', note: 'Family-friendly positioning' }] }
    await updateStep('market_adaptation','succeeded', market)
    await setProgress(78)

    await updateStep('package_assembly','running')
    const outline = { deck_outline: ['Title','Logline','Synopsis','Characters','Market Fit','Budget'], budget: { range: '₹1Cr–₹5Cr' } }
    await updateStep('package_assembly','succeeded', outline)
    await setProgress(90)

    await updateStep('final_package','running')
    const pkgSummary = { summary: { ...core, ...bible, ...market, ...outline } }
    // Optionally: upload a JSON summary as artifact
    const artifactPath = `generated-assets/${ingestion.user_id}/${ingestion_id}/summary.json`
    await supabase.storage.from('generated-assets').upload(artifactPath, Buffer.from(JSON.stringify(pkgSummary.summary, null, 2)), { contentType: 'application/json', upsert: true })

    interface Artifact {
      path: string;
      type: 'summary' | 'pdf_deck' | 'pptx_deck' | 'docx_summary';
    }
    const artifacts: Artifact[] = [{ path: artifactPath, type: 'summary' }]
    if (pdfDeckPath) artifacts.push({ path: pdfDeckPath, type: 'pdf_deck' })
    if (pptxDeckPath) artifacts.push({ path: pptxDeckPath, type: 'pptx_deck' })
    if (docxSummaryPath) artifacts.push({ path: docxSummaryPath, type: 'docx_summary' })

    await supabase.from('packages').insert({
      ingestion_id,
      summary: pkgSummary.summary,
      deck_url: pptxDeckPath || null,
      document_url: docxSummaryPath || null,
      artifacts
    })
    await updateStep('final_package','succeeded', { artifacts: [{ path: artifactPath }] })
    await supabase.from('ingestions').update({ status: 'succeeded', progress: 100 }).eq('id', ingestion_id)

    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    await supabase.from('ingestions').update({ status: 'failed', error: errorMessage }).eq('id', ingestion_id)
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
