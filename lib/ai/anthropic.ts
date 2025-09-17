import Anthropic from '@anthropic-ai/sdk'

export type ClaudeResult = {
  text: string
}

// Server-only helper to call Claude with a simple prompt.
// Returns plain text; callers can parse JSON as needed.
export async function callClaude(prompt: string, system?: string, maxTokens: number = 1500): Promise<ClaudeResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error('Missing ANTHROPIC_API_KEY')
  }

  const anthropic = new Anthropic({ apiKey })

  const msg = await anthropic.messages.create({
    model: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20240620',
    max_tokens: Math.max(256, Math.min(2000, maxTokens)),
    temperature: 0.2,
    system: system || 'You are a precise assistant. Respond in strict JSON when asked.',
    messages: [
      { role: 'user', content: prompt }
    ]
  })

  // Consolidate all text parts
  interface ContentPart {
    type: string;
    text?: string;
  }
  const parts = (msg?.content || []).map((c: ContentPart) => c.type === 'text' ? c.text : '').filter(Boolean)
  return { text: parts.join('\n').trim() }
}

export function safeParseJSON<T = unknown>(text: string): T | null {
  try {
    return JSON.parse(text) as T
  } catch {
    // Try to recover JSON block if wrapped in prose
    const match = text.match(/\{[\s\S]*\}$/)
    if (match) {
      try { return JSON.parse(match[0]) as T } catch {}
    }
    return null
  }
}

