import { z } from 'zod'

function parseNumberLike(input: unknown, fallback: number): number {
  if (typeof input === 'number') return input
  if (typeof input !== 'string') return fallback
  const t = input.trim().toLowerCase()
  const m = t.match(/^(\d+)(k|m)?$/)
  if (!m) return Number.isFinite(Number(t)) ? Number(t) : fallback
  const v = Number(m[1])
  const u = m[2]
  if (u === 'k') return v * 1_000
  if (u === 'm') return v * 1_000_000
  return v
}

const ServerSchema = z.object({
  // Required API Keys
  ANTHROPIC_API_KEY: z.string()
    .min(1, 'MISSING: ANTHROPIC_API_KEY')
    .refine(key => key.startsWith('sk-ant-'), 'INVALID: ANTHROPIC_API_KEY must start with sk-ant-'),

  SUPABASE_SERVICE_ROLE_KEY: z.string()
    .min(1, 'MISSING: SUPABASE_SERVICE_ROLE_KEY')
    .refine(key => key.startsWith('eyJ'), 'INVALID: SUPABASE_SERVICE_ROLE_KEY appears to be malformed'),

  // File Processing Configuration
  FILE_MAX_SIZE_MB: z.union([z.string(), z.number()])
    .optional()
    .default(25)
    .transform(val => {
      const parsed = parseNumberLike(val, 25)
      if (parsed < 1 || parsed > 50) {
        throw new Error('FILE_MAX_SIZE_MB must be between 1 and 50')
      }
      return parsed
    }),

  PIPELINE_MAX_TOKENS: z.union([z.string(), z.number()])
    .optional()
    .default(120000)
    .transform(val => {
      const parsed = parseNumberLike(val, 120000)
      if (parsed < 10000 || parsed > 1000000) {
        throw new Error('PIPELINE_MAX_TOKENS must be between 10,000 and 1,000,000')
      }
      return parsed
    }),

  FILE_PROCESSING_TIMEOUT: z.union([z.string(), z.number()])
    .optional()
    .default(25000)
    .transform(val => {
      const parsed = parseNumberLike(val, 25000)
      if (parsed < 5000 || parsed > 300000) {
        throw new Error('FILE_PROCESSING_TIMEOUT must be between 5,000ms (5s) and 300,000ms (5min)')
      }
      return parsed
    }),

  // Optional Configuration
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).optional().default('info'),

  ENABLE_FILE_SECURITY_SCAN: z.union([z.string(), z.boolean()])
    .optional()
    .default(false)
    .transform(val => {
      if (typeof val === 'boolean') return val
      return val.toLowerCase() === 'true'
    }),

  ENABLE_PROCESSING_LOGS: z.union([z.string(), z.boolean()])
    .optional()
    .default(true)
    .transform(val => {
      if (typeof val === 'boolean') return val
      return val.toLowerCase() === 'true'
    }),

  ENABLE_PERFORMANCE_MONITORING: z.union([z.string(), z.boolean()])
    .optional()
    .default(true)
    .transform(val => {
      if (typeof val === 'boolean') return val
      return val.toLowerCase() === 'true'
    }),

  // Vercel specific
  VERCEL_REGION: z.string().optional(),
  NODE_ENV: z.enum(['development', 'production', 'test']).optional().default('development'),
})

function formatIssues(issues: z.ZodIssue[]): string {
  return issues
    .map((i) => {
      const path = i.path && i.path.length ? ` (${i.path.join('.')})` : ''
      const msg = i.message || 'Invalid'
      return `- ${msg}${path}`
    })
    .join('\n')
}

export function getServerEnv() {
  const parsed = ServerSchema.safeParse(process.env)
  if (!parsed.success) {
    const formatted = formatIssues(parsed.error.issues)
    console.error('[env:server] Missing/invalid environment variables:\n' + formatted)

    // In development, provide helpful guidance
    if (process.env.NODE_ENV === 'development') {
      console.error('\n📝 Development Setup Guide:')
      console.error('1. Copy .env.example to .env.local')
      console.error('2. Fill in your actual API keys and configuration')
      console.error('3. Restart your development server')
      console.error('\n🔗 Get your keys from:')
      console.error('- Anthropic: https://console.anthropic.com/')
      console.error('- Supabase: https://supabase.com/dashboard/project/YOUR-PROJECT/settings/api')
    }

    throw new Error('Environment validation failed:\n' + formatted)
  }

  const env = parsed.data

  // Log successful validation in development
  if (process.env.NODE_ENV === 'development') {
    console.log('✅ Server environment variables validated successfully')
    console.log(`📁 File max size: ${env.FILE_MAX_SIZE_MB}MB`)
    console.log(`🤖 Pipeline max tokens: ${env.PIPELINE_MAX_TOKENS.toLocaleString()}`)
    console.log(`⏱️ Processing timeout: ${env.FILE_PROCESSING_TIMEOUT}ms`)
    console.log(`📊 Logging level: ${env.LOG_LEVEL}`)
  }

  return env
}

