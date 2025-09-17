export type PitchCharacter = {
  name: string
  description?: string
  motivations?: string[]
  conflicts?: string[]
  relationships?: string[]
  arc?: string
  cultural_context?: string
}

export type PitchData = {
  title?: string
  logline?: string
  synopsis?: string
  themes?: string[]
  genres?: string[]
  characters?: PitchCharacter[]
  marketTags?: string[]
}

export async function generatePitchPDF(data: PitchData): Promise<Buffer> {
  const pdfLib = await import('pdf-lib')
  const doc = await pdfLib.PDFDocument.create()
  const font = await doc.embedFont(pdfLib.StandardFonts.Helvetica)

  const addPageWithText = (title: string, lines: string[]) => {
    const page = doc.addPage([612, 792])
    const { height } = page.getSize()
    let y = height - 72
    page.drawText(title, { x: 72, y, size: 24, font, color: pdfLib.rgb(0.2, 0.2, 0.35) })
    y -= 32
    for (const line of lines) {
      if (!line) continue
      page.drawText(line.substring(0, 110), { x: 72, y, size: 12, font, color: pdfLib.rgb(0.1, 0.1, 0.1) })
      y -= 16
      if (y < 72) {
        y = height - 72
      }
    }
  }

  const header = data.title || 'Pitch Deck'
  addPageWithText(header, [data.logline || ''])

  if (data.synopsis) {
    addPageWithText('Synopsis', data.synopsis.split('\n').map(s => s.trim()).filter(Boolean))
  }

  const tags: string[] = []
  if (data.themes?.length) tags.push(`Themes: ${data.themes.join(', ')}`)
  if (data.genres?.length) tags.push(`Genres: ${data.genres.join(', ')}`)
  if (data.marketTags?.length) tags.push(`Market: ${data.marketTags.join(', ')}`)
  if (tags.length) {
    addPageWithText('Positioning (India/Bharat)', tags)
  }

  const chars = data.characters || []
  if (chars.length) {
    const lines: string[] = []
    for (const c of chars) {
      lines.push(`• ${c.name}`)
      if (c.description) lines.push(`  - ${c.description}`)
      if (c.motivations?.length) lines.push(`  - Motivations: ${c.motivations.join(', ')}`)
      if (c.conflicts?.length) lines.push(`  - Conflicts: ${c.conflicts.join(', ')}`)
      if (c.arc) lines.push(`  - Arc: ${c.arc}`)
      if (c.cultural_context) lines.push(`  - Cultural: ${c.cultural_context}`)
      lines.push('')
    }
    addPageWithText('Characters', lines)
  }

  const pdfBytes = await doc.save()
  return Buffer.from(pdfBytes)
}

export async function generatePitchPPTX(data: PitchData): Promise<Buffer> {
  const factory = (await import('officegen')) as unknown as (type: 'pptx') => unknown
  const pptx = factory('pptx') as unknown as {
    on: (event: 'error', cb: (e: unknown) => void) => void
    makeTitleSlide?: (title: string, subtitle?: string) => void
    makeNewSlide: () => {
      back?: string
      addText: (text: string | string[], opts?: Record<string, unknown>) => void
    }
    generate: (out: NodeJS.WritableStream) => void
  }

  pptx.on('error', function () {})

  const title = data.title || 'Pitch Deck'
  const sub = (data.genres && data.genres.length ? data.genres.join(', ') : '') || (data.marketTags && data.marketTags.join(', ') || '')
  try {
    if (typeof pptx.makeTitleSlide === 'function') {
      pptx.makeTitleSlide(title, sub)
    } else {
      const slide = pptx.makeNewSlide()
      slide.back = 'FFFFFF'
      slide.addText(title, { x: 1.0, y: 0.8, cx: 8.0, cy: 1.0, font_size: 36, color: '1A1A59', bold: true, align: 'center' })
      if (sub) slide.addText(sub, { x: 1.0, y: 1.8, cx: 8.0, cy: 0.6, font_size: 18, color: '444444', align: 'center' })
    }
  } catch {}

  const slideLogline = pptx.makeNewSlide()
  slideLogline.addText('Logline', { x: 0.8, y: 0.6, font_size: 28, bold: true, color: '1A1A59' })
  slideLogline.addText(data.logline || '', { x: 0.8, y: 1.2, cx: 8.4, font_size: 18, color: '222222' })

  if (data.themes?.length || data.marketTags?.length) {
    const slidePos = pptx.makeNewSlide()
    slidePos.addText('Positioning (India/Bharat)', { x: 0.8, y: 0.6, font_size: 24, bold: true, color: '1A1A59' })
    if (data.themes?.length) slidePos.addText(`Themes: ${data.themes.join(', ')}`, { x: 0.8, y: 1.2, cx: 8.4, font_size: 18 })
    if (data.marketTags?.length) slidePos.addText(`Market: ${data.marketTags.join(', ')}`, { x: 0.8, y: 1.8, cx: 8.4, font_size: 18 })
  }

  const chars = data.characters || []
  if (chars.length) {
    const slideChars = pptx.makeNewSlide()
    slideChars.addText('Characters', { x: 0.8, y: 0.6, font_size: 24, bold: true, color: '1A1A59' })
    let y = 1.2
    for (const c of chars.slice(0, 6)) {
      slideChars.addText(`• ${c.name}`, { x: 0.8, y, font_size: 18, bold: true })
      y += 0.4
      const detail: string[] = []
      if (c.arc) detail.push(`Arc: ${c.arc}`)
      if (c.cultural_context) detail.push(`Context: ${c.cultural_context}`)
      if (detail.length) {
        slideChars.addText(detail.join(' — '), { x: 1.1, y, font_size: 16, color: '444444' })
        y += 0.4
      }
      if (y > 6.5) break
    }
  }

  const { PassThrough } = await import('stream')
  const out = new PassThrough()
  const chunks: Buffer[] = []
  out.on('data', (c: unknown) => chunks.push(Buffer.from(c as Uint8Array)))
  const bufPromise: Promise<Buffer> = new Promise((resolve, reject) => {
    out.on('finish', () => resolve(Buffer.concat(chunks)))
    out.on('error', reject)
  })
  pptx.generate(out)
  return await bufPromise
}

export async function generateSummaryDOCX(data: PitchData): Promise<Buffer> {
  const mod = await import('docx')
  const { Document, Packer, Paragraph, HeadingLevel, TextRun } = mod

  const children: Array<InstanceType<typeof Paragraph>> = []

  children.push(new Paragraph({ text: data.title || 'Executive Summary', heading: HeadingLevel.TITLE }))
  if (data.logline) {
    children.push(new Paragraph({ text: 'Logline', heading: HeadingLevel.HEADING_2 }))
    children.push(new Paragraph({ children: [new TextRun({ text: data.logline })] }))
  }
  if (data.synopsis) {
    children.push(new Paragraph({ text: 'Synopsis', heading: HeadingLevel.HEADING_2 }))
    for (const para of data.synopsis.split('\n').filter(Boolean)) {
      children.push(new Paragraph({ children: [new TextRun({ text: para })] }))
    }
  }
  if (data.themes?.length || data.genres?.length || data.marketTags?.length) {
    children.push(new Paragraph({ text: 'Positioning (India/Bharat)', heading: HeadingLevel.HEADING_2 }))
    if (data.themes?.length) children.push(new Paragraph({ children: [new TextRun(`Themes: ${data.themes.join(', ')}`)] }))
    if (data.genres?.length) children.push(new Paragraph({ children: [new TextRun(`Genres: ${data.genres.join(', ')}`)] }))
    if (data.marketTags?.length) children.push(new Paragraph({ children: [new TextRun(`Market: ${data.marketTags.join(', ')}`)] }))
  }
  const chars = data.characters || []
  if (chars.length) {
    children.push(new Paragraph({ text: 'Characters', heading: HeadingLevel.HEADING_2 }))
    for (const c of chars) {
      children.push(new Paragraph({ text: c.name, heading: HeadingLevel.HEADING_3 }))
      if (c.description) children.push(new Paragraph(c.description))
      if (c.motivations?.length) children.push(new Paragraph(`Motivations: ${c.motivations.join(', ')}`))
      if (c.conflicts?.length) children.push(new Paragraph(`Conflicts: ${c.conflicts.join(', ')}`))
      if (c.arc) children.push(new Paragraph(`Arc: ${c.arc}`))
      if (c.cultural_context) children.push(new Paragraph(`Cultural Context: ${c.cultural_context}`))
    }
  }

  const doc = new Document({ sections: [{ children }] })
  const buffer = await Packer.toBuffer(doc)
  return buffer
}
