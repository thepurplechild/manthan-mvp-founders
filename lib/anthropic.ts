import Anthropic from '@anthropic-ai/sdk'
import pRetry, { AbortError } from 'p-retry'
import { getServerEnv } from '@/lib/env'

let _anthropic: Anthropic | null = null
function getAnthropic(): Anthropic {
  if (_anthropic) return _anthropic
  const env = getServerEnv()
  _anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
  return _anthropic
}

export type ClaudeResult = { text: string }

export async function callClaudeSafe(prompt: string, system?: string, maxTokens = 1500): Promise<ClaudeResult> {
  return pRetry(async () => {
    try {
      const msg = await getAnthropic().messages.create({
        model: 'claude-3-5-sonnet-20240620',
        max_tokens: Math.max(256, Math.min(2000, maxTokens)),
        temperature: 0.2,
        system: system || 'You are a precise assistant. Respond in strict JSON when asked.',
        messages: [{ role: 'user', content: prompt }],
      })
      const content = (msg as unknown as { content?: Array<{ type: string; text?: string }> }).content || []
      const parts = content.map((c) => (c.type === 'text' ? (c.text || '') : '')).filter(Boolean)
      return { text: parts.join('\n').trim() }
    } catch (err: unknown) {
      const status = (err as { status?: number; response?: { status?: number } })?.status || (err as { response?: { status?: number } })?.response?.status
      if (status && status >= 400 && status < 500 && status !== 429) {
        throw new AbortError(err as Error)
      }
      throw err
    }
  }, { retries: 3, factor: 2, minTimeout: 300, maxTimeout: 1500 })
}

export function safeParseJSON<T = unknown>(text: string): T | null {
  try { return JSON.parse(text) as T } catch {
    const match = text.match(/\{[\s\S]*\}$/)
    if (match) { try { return JSON.parse(match[0]) as T } catch {} }
    return null
  }
}
