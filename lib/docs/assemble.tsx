import React from 'react'
import { pdf } from '@react-pdf/renderer'
import { PitchPdfDoc, type PitchPdfProps } from '@/lib/docs/templates/pitch-pdf'
import { ExecutiveSummaryDoc, type ExecSummaryProps } from '@/lib/docs/templates/executive-summary'
import { buildPitchPptx, type PitchPptxProps } from '@/lib/docs/templates/pitch-pptx'
import type { CoreElements, CharactersResult, MarketAdaptation, PitchContent, VisualConcepts } from '@/types/pipeline'

export type AssembleInput = {
  projectTitle: string
  creator?: string
  contact?: { email?: string; phone?: string }
  core: CoreElements
  characters: CharactersResult
  market: MarketAdaptation
  pitch: PitchContent
  visuals: VisualConcepts
}

export function assembleTemplates(input: AssembleInput) {
  const pdfProps: PitchPdfProps = {
    title: input.projectTitle,
    creator: input.creator,
    logline: input.core.logline,
    synopsis: input.core.synopsis,
    characters: (input.characters.characters || []).map((c) => ({
      name: c.name,
      summary: [c.description, c.arc].filter(Boolean).join(' — '),
    })),
    market: [
      ...(input.market.recommendations || []).map((r) => `${r.platform}${r.note ? ` — ${r.note}` : ''}`),
      ...(input.core.genres?.length ? [`Genres: ${input.core.genres.join(', ')}`] : []),
    ],
    visuals: input.visuals.scenes || [],
    creatorBio: undefined,
    contact: input.contact,
  }

  const pptxProps: PitchPptxProps = {
    title: input.projectTitle,
    subtitle: input.core.genres?.join(', ') || undefined,
    logline: input.core.logline,
    sections: (input.pitch.sections || []).map((s) => ({ title: s.title, bullets: s.bullets, note: s.notes as string | undefined })),
    characters: (input.characters.characters || []).map((c) => ({ name: c.name, arc: c.arc, context: c.cultural_context })),
    visuals: input.visuals.scenes,
  }

  const execProps: ExecSummaryProps = {
    title: input.projectTitle,
    logline: input.core.logline,
    problem: undefined,
    opportunity: undefined,
    marketFit: (input.market.recommendations || []).map((r) => `${r.platform}${r.note ? ` — ${r.note}` : ''}`).join('\n'),
    viability: undefined,
    timeline: undefined,
    budgetRange: undefined,
    contact: input.contact,
  }

  return { pdfProps, pptxProps, execProps }
}

export async function generatePitchPdf(props: PitchPdfProps): Promise<Buffer> {
  const instance = pdf(<PitchPdfDoc {...props} />)
  const raw: unknown = await instance.toBuffer()
  return await normalizeToBuffer(raw)
}

export async function generateExecutiveSummary(props: ExecSummaryProps): Promise<Buffer> {
  const instance = pdf(<ExecutiveSummaryDoc {...props} />)
  const raw: unknown = await instance.toBuffer()
  return await normalizeToBuffer(raw)
}

export async function generatePitchPptx(props: PitchPptxProps): Promise<Buffer> {
  return await buildPitchPptx(props)
}

export async function generateAllDocsFromPipeline(input: AssembleInput) {
  const { pdfProps, pptxProps, execProps } = assembleTemplates(input)
  const [pdfBuf, pptxBuf, execBuf] = await Promise.all([
    generatePitchPdf(pdfProps),
    generatePitchPptx(pptxProps),
    generateExecutiveSummary(execProps),
  ])
  return { pdf: pdfBuf, pptx: pptxBuf, exec: execBuf }
}

async function normalizeToBuffer(out: unknown): Promise<Buffer> {
  if (Buffer.isBuffer(out)) return out
  if (out instanceof Uint8Array) return Buffer.from(out)
  
  // Web ReadableStream
  if (out && typeof out === 'object' && 'getReader' in out && typeof out.getReader === 'function') {
    const reader = (out as ReadableStream).getReader()
    const parts: Buffer[] = []
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      parts.push(Buffer.from(value))
    }
    return Buffer.concat(parts)
  }
  
  // Node.js Readable
  if (out && typeof out === 'object' && 'on' in out && typeof out.on === 'function') {
    return await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = []
      const stream = out as NodeJS.ReadableStream
      stream.on('data', (c: Buffer) => chunks.push(Buffer.from(c)))
      stream.on('end', () => resolve(Buffer.concat(chunks)))
      stream.on('error', reject)
    })
  }
  
  return Buffer.from(String(out ?? ''), 'utf8')
}
