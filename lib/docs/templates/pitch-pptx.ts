import PptxGenJS from 'pptxgenjs'
import { brand } from '@/lib/docs/brand'
import { bulletsFromList, splitParagraphs, safeTruncate } from '@/lib/docs/formatters'

export type PitchPptxProps = {
  title: string
  subtitle?: string
  logline?: string
  sections?: { title: string; bullets?: string[]; note?: string }[]
  characters?: { name: string; arc?: string; context?: string }[]
  visuals?: { prompt: string; style?: string }[]
}

export async function buildPitchPptx(props: PitchPptxProps): Promise<Buffer> {
  const pptx = new PptxGenJS()
  pptx.defineLayout({ name: 'A4', width: 11.69, height: 8.27 })
  pptx.layout = 'A4'

  const title = pptx.addSlide()
  title.background = { fill: brand.colors.white }
  title.addText(safeTruncate(props.title, 90), { x: 0.5, y: 1.2, w: 10.6, h: 1.0, fontSize: 36, bold: true, color: brand.colors.royalBlue, align: 'center' })
  if (props.subtitle) title.addText(props.subtitle, { x: 0.5, y: 2.2, w: 10.6, h: 0.6, fontSize: 18, color: brand.colors.slate700, align: 'center' })

  const log = pptx.addSlide()
  log.addText('Logline', { x: 0.6, y: 0.6, fontSize: 24, bold: true, color: brand.colors.saffron })
  if (props.logline) log.addText(safeTruncate(props.logline, 500), { x: 0.6, y: 1.2, w: 10.4, fontSize: 18, color: brand.colors.slate900 })

  // Characters slide
  if (props.characters?.length) {
    const s = pptx.addSlide()
    s.addText('Characters', { x: 0.6, y: 0.6, fontSize: 24, bold: true, color: brand.colors.gold })
    let y = 1.1
    for (const c of props.characters.slice(0, 8)) {
      s.addText(`• ${c.name}`, { x: 0.8, y, fontSize: 18, bold: true })
      y += 0.35
      const sub = [c.arc && `Arc: ${c.arc}`, c.context && `Context: ${c.context}`].filter(Boolean).join(' — ')
      if (sub) {
        s.addText(sub, { x: 1.1, y, fontSize: 14, color: brand.colors.slate700 })
        y += 0.4
      }
      if (y > 6.2) break
    }
  }

  // Sections
  for (const [idx, sec] of (props.sections || []).entries()) {
    const s = pptx.addSlide()
    const accent = [brand.colors.royalBlue, brand.colors.saffron, brand.colors.gold][idx % 3]
    s.addText(sec.title, { x: 0.6, y: 0.6, fontSize: 22, bold: true, color: accent })
    const bullets = bulletsFromList(sec.bullets || [], 10)
    if (bullets.length) {
      s.addText(bullets.map((b) => `• ${b}`), { x: 0.8, y: 1.1, w: 5.0, fontSize: 16, color: brand.colors.slate900, lineSpacing: 24 })
    }
    if (sec.note) {
      const paras = splitParagraphs(sec.note)
      const txt = paras.join('\n')
      s.addText(txt, { x: 6.0, y: 1.1, w: 4.6, fontSize: 14, color: brand.colors.slate700 })
    }
  }

  // Visual concepts slide
  if (props.visuals?.length) {
    const s = pptx.addSlide()
    s.addText('Visual Concepts', { x: 0.6, y: 0.6, fontSize: 22, bold: true, color: brand.colors.royalBlue })
    const rows = props.visuals.slice(0, 10).map((v) => `• ${v.prompt}${v.style ? ` — ${v.style}` : ''}`)
    s.addText(rows, { x: 0.8, y: 1.1, w: 10.0, fontSize: 16 })
  }

  const arrBuf: ArrayBuffer = await pptx.write('arraybuffer')
  const nodeBuf = Buffer.from(new Uint8Array(arrBuf))
  return nodeBuf
}

