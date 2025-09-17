import type { CoreElements } from '@/types/pipeline'

export function buildCharactersPrompt(core: CoreElements) {
  const system = 'You are a screenwriting expert with Indian market context. Respond in strict JSON.'
  const prompt = `Using the core elements JSON below, generate a CHARACTER_BIBLE as JSON with key: characters (array of objects each with name, motivations (string[]), conflicts (string[]), relationships (string[]), arc (string), cultural_context (string), description (string)). Respond ONLY JSON.\n\nCORE_ELEMENTS_JSON:\n${JSON.stringify(core)}`
  return { system, prompt }
}

