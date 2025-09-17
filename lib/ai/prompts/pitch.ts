import type { CoreElements, MarketAdaptation, CharactersResult } from '@/types/pipeline'

export function buildPitchPrompt(core: CoreElements, market: MarketAdaptation, chars: CharactersResult) {
  const system = 'You are a development exec creating pitch materials. Respond in strict JSON.'
  const prompt = `Create pitch deck content. Return JSON: sections (array of { title, bullets (string[]), notes? }). Base on: CORE, MARKET, CHARACTERS. Keep concise, film-ready language for India/Bharat.\n\nCORE:\n${JSON.stringify(core)}\n\nMARKET:\n${JSON.stringify(market)}\n\nCHARACTERS:\n${JSON.stringify(chars)}`
  return { system, prompt }
}

