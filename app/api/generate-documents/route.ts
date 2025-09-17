import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'
import { generatePitchPDF, generatePitchPPTX, generateSummaryDOCX, type PitchData } from '@/lib/generation/documents'

const Body = z.object({
  projectId: z.string(),
  data: z.object({
    title: z.string().optional(),
    logline: z.string().optional(),
    synopsis: z.string().optional(),
    themes: z.array(z.string()).optional(),
    genres: z.array(z.string()).optional(),
    characters: z.any().optional(),
    marketTags: z.array(z.string()).optional(),
  })
})

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const rl = rateLimit(`ai:docs:${ip}`, 10, 60000)
  if (!rl.allowed) return NextResponse.json({ code: 'rate_limited', message: 'Too many requests', hint: `Retry in ${Math.ceil(rl.retryAfter/1000)}s` }, { status: 429 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ code: 'unauthorized', message: 'Sign in required' }, { status: 401 })

  const body = Body.safeParse(await req.json())
  if (!body.success) return NextResponse.json({ code: 'bad_request', message: 'Invalid payload', hint: body.error.issues.map(i=>i.message).join('; ') }, { status: 400 })

  const { projectId, data } = body.data
  const pd: PitchData = data as PitchData

  try {
    const [pdf, pptx, docx] = await Promise.all([
      generatePitchPDF(pd),
      generatePitchPPTX(pd),
      generateSummaryDOCX(pd)
    ])

    const base = `generated-assets/${user.id}/${projectId}-${Date.now()}`
    const pdfPath = `${base}/pitch.pdf`
    const pptxPath = `${base}/pitch.pptx`
    const docxPath = `${base}/summary.docx`

    await supabase.storage.from('generated-assets').upload(pdfPath, pdf, { contentType: 'application/pdf', upsert: true })
    await supabase.storage.from('generated-assets').upload(pptxPath, pptx, { contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', upsert: true })
    await supabase.storage.from('generated-assets').upload(docxPath, docx, { contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', upsert: true })

    await supabase.from('generated_assets').insert([
      { project_id: projectId, asset_type: 'pitch_deck', asset_url: pptxPath },
      { project_id: projectId, asset_type: 'pdf_deck', asset_url: pdfPath },
      { project_id: projectId, asset_type: 'exec_summary', asset_url: docxPath },
    ])

    return NextResponse.json({ ok: true, assets: { pdf: pdfPath, pptx: pptxPath, docx: docxPath } })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ code: 'doc_generation_failed', message: msg, retriable: false }, { status: 500 })
  }
}
