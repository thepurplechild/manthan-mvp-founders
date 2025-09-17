import type { StructuredScript } from '@/lib/ingestion/parsers'

export type SceneBrief = {
  sceneNumber: number
  heading: string
  prompts: string[]
}

export type VisualBrief = {
  scenes: SceneBrief[]
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/(^|\s)\S/g, (t) => t.toUpperCase())
}

export function generateVisualBrief(struct?: StructuredScript | null): VisualBrief {
  const scenes: SceneBrief[] = []
  if (!struct || !Array.isArray(struct.scenes) || struct.scenes.length === 0) {
    return { scenes }
  }

  for (const sc of struct.scenes) {
    const heading = sc.heading || 'SCENE'
    const location = heading.replace(/^(INT\.|EXT\.)\s*/i, '')
    // Derive mood from action heuristically
    const mood = (sc.action || '').toLowerCase().includes('night') ? 'moody, low-key lighting' :
                 (sc.action || '').toLowerCase().includes('rain') ? 'rain-soaked, dramatic' :
                 (sc.action || '').toLowerCase().includes('crowd') ? 'bustling, energetic' :
                 'cinematic, natural light'
    const chars = Array.from(new Set((sc.dialogue || []).map((d) => d.character).filter(Boolean))).slice(0, 3)
    const charLine = chars.length ? `Characters: ${chars.join(', ')}` : 'Characters: (unspecified)'

    const base = titleCase(location)
    const prompts: string[] = [
      `${base} — wide establishing shot, ${mood}, Indian context, authentic textures, 35mm look`,
      `${base} — character-focused mid-shot, ${mood}, cultural details, warm color grade, India`,
      `${base} — mood board: palette, props, wardrobe inspired by Indian/Bollywood sensibilities`
    ]

    prompts.forEach((p, idx) => {
      prompts[idx] = `${p}. ${charLine}.`
    })

    scenes.push({ sceneNumber: sc.sceneNumber || scenes.length + 1, heading, prompts })
  }

  return { scenes }
}

export type GeneratedVisual = { prompt: string; image_url: string | null }

export async function maybeGenerateImages(prompts: string[]): Promise<GeneratedVisual[]> {
  const apiKey = process.env.STABLE_DIFFUSION_API_KEY
  const apiUrl = process.env.STABLE_DIFFUSION_API_URL // mock endpoint for now
  const results: GeneratedVisual[] = []
  for (const p of prompts) {
    if (apiKey && apiUrl) {
      try {
        const r = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({ prompt: p, steps: 25, guidance: 7.5 })
        })
        if (r.ok) {
          const j = await r.json()
          results.push({ prompt: p, image_url: j?.image_url || null })
        } else {
          results.push({ prompt: p, image_url: null })
        }
      } catch {
        results.push({ prompt: p, image_url: null })
      }
    } else {
      results.push({ prompt: p, image_url: null })
    }
  }
  return results
}

