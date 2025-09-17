import type { CoreElements, CharactersResult } from '@/types/pipeline'

export function buildMarketPrompt(core: CoreElements, chars: CharactersResult, overrides?: { targetPlatform?: string; tone?: string }) {
  const system = 'You are an Indian entertainment strategist. Respond in strict JSON.'
  const extras = [
    overrides?.targetPlatform ? `Target platform preference: ${overrides.targetPlatform}` : '',
    overrides?.tone ? `Desired tone/voice: ${overrides.tone}` : '',
  ].filter(Boolean).join('\n')
  const prompt = `Given the core elements and characters, propose an India-focused market adaptation. Return JSON with keys: recommendations (array of { platform, note }), variants (array of { format: 'OTT'|'Film'|'Shorts', angle }).\n${extras ? `\nGUIDANCE:\n${extras}\n` : ''}\nCORE:\n${JSON.stringify(core)}\n\nCHARACTERS:\n${JSON.stringify(chars)}`
  return { system, prompt }
}
