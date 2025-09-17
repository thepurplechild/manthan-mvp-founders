export function buildElementsPrompt(text: string) {
  const system = 'You are a film development analyst. Respond in strict JSON.'
  const prompt = `Extract core elements from the script text. Respond ONLY JSON with keys: logline (string), synopsis (string, 2-4 paragraphs), themes (string[]), genres (string[]), comps (string[]).
TEXT:\n${text.slice(0, 120000)}`
  return { system, prompt }
}

