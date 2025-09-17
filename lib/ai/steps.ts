import { callClaudeSafe, safeParseJSON } from '@/lib/anthropic'
import { buildElementsPrompt } from '@/lib/ai/prompts/elements'
import { buildCharactersPrompt } from '@/lib/ai/prompts/characters'
import { buildMarketPrompt } from '@/lib/ai/prompts/market'
import { buildPitchPrompt } from '@/lib/ai/prompts/pitch'
import { buildVisualsPrompt } from '@/lib/ai/prompts/visuals'
import type { CoreElements, CharactersResult, MarketAdaptation, PitchContent, VisualConcepts } from '@/types/pipeline'
import { CoreElements as CoreSchema, CharactersResult as CharactersSchema, MarketAdaptation as MarketSchema, PitchContent as PitchSchema, VisualConcepts as VisualsSchema } from '@/types/pipeline'

export async function stepExtractElements(text: string): Promise<CoreElements> {
  const { prompt, system } = buildElementsPrompt(text)
  const { text: out } = await callClaudeSafe(prompt, system, 1800)
  const parsed = safeParseJSON(out) || {}
  return CoreSchema.parse(parsed)
}

export async function stepGenerateCharacters(core: CoreElements): Promise<CharactersResult> {
  const { prompt, system } = buildCharactersPrompt(core)
  const { text } = await callClaudeSafe(prompt, system, 1800)
  const parsed = safeParseJSON(text) || {}
  return CharactersSchema.parse(parsed)
}

export async function stepMarketAdaptation(core: CoreElements, chars: CharactersResult, overrides?: { targetPlatform?: string; tone?: string }): Promise<MarketAdaptation> {
  const { prompt, system } = buildMarketPrompt(core, chars, overrides)
  const { text } = await callClaudeSafe(prompt, system, 1500)
  const parsed = safeParseJSON(text) || {}
  return MarketSchema.parse(parsed)
}

export async function stepPitchContent(core: CoreElements, market: MarketAdaptation, chars: CharactersResult): Promise<PitchContent> {
  const { prompt, system } = buildPitchPrompt(core, market, chars)
  const { text } = await callClaudeSafe(prompt, system, 1800)
  const parsed = safeParseJSON(text) || {}
  return PitchSchema.parse(parsed)
}

export async function stepVisualConcepts(core: CoreElements, chars: CharactersResult): Promise<VisualConcepts> {
  const { prompt, system } = buildVisualsPrompt(core, chars)
  const { text } = await callClaudeSafe(prompt, system, 1200)
  const parsed = safeParseJSON(text) || {}
  return VisualsSchema.parse(parsed)
}
