import type { CoreElements, CharactersResult } from '@/types/pipeline'

export function buildVisualsPrompt(core: CoreElements, chars: CharactersResult) {
  const system = 'You are a visual director. Respond in strict JSON.'
  const prompt = `Propose visual concepts as JSON with key scenes: scenes (array of { prompt, style? }). Text-only prompts suitable for image generation; no images or base64.\n\nCORE:\n${JSON.stringify(core)}\n\nCHARACTERS:\n${JSON.stringify(chars)}`
  return { system, prompt }
}

