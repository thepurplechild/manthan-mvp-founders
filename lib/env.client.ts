import { z } from 'zod'

const isDev = process.env.NODE_ENV !== 'production'

const ClientSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string()
    .url('INVALID URL: NEXT_PUBLIC_SUPABASE_URL')
    .refine(url => url.includes('supabase.co'), 'NEXT_PUBLIC_SUPABASE_URL must be a valid Supabase URL'),

  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string()
    .min(1, 'MISSING: NEXT_PUBLIC_SUPABASE_ANON_KEY')
    .refine(key => key.startsWith('eyJ'), 'INVALID: NEXT_PUBLIC_SUPABASE_ANON_KEY appears to be malformed'),

  NEXT_PUBLIC_APP_URL: z.string().refine((v) => {
    try {
      const u = new URL(v)
      return isDev ? true : u.protocol === 'https:'
    } catch {
      return false
    }
  }, isDev ? 'INVALID URL: NEXT_PUBLIC_APP_URL' : 'NEXT_PUBLIC_APP_URL must use HTTPS in production'),

  // Optional Vercel configuration
  NEXT_PUBLIC_VERCEL_ANALYTICS: z.union([z.string(), z.boolean()])
    .optional()
    .default(false)
    .transform(val => {
      if (typeof val === 'boolean') return val
      return val.toLowerCase() === 'true'
    }),

  NEXT_PUBLIC_VERCEL_SPEED_INSIGHTS: z.union([z.string(), z.boolean()])
    .optional()
    .default(false)
    .transform(val => {
      if (typeof val === 'boolean') return val
      return val.toLowerCase() === 'true'
    }),
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

export function getClientEnv() {
  const parsed = ClientSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_VERCEL_ANALYTICS: process.env.NEXT_PUBLIC_VERCEL_ANALYTICS,
    NEXT_PUBLIC_VERCEL_SPEED_INSIGHTS: process.env.NEXT_PUBLIC_VERCEL_SPEED_INSIGHTS,
  })

  if (!parsed.success) {
    const formatted = formatIssues(parsed.error.issues)
    console.warn('[env:client] Missing/invalid environment variables:\n' + formatted)

    // In development, provide helpful guidance
    if (isDev) {
      console.warn('\n📝 Client Environment Setup Guide:')
      console.warn('1. Ensure all NEXT_PUBLIC_* variables are set in .env.local')
      console.warn('2. Restart your development server after making changes')
      console.warn('3. Check that your Supabase project is active')
      console.warn('\n🔗 Get your Supabase keys from:')
      console.warn('https://supabase.com/dashboard/project/YOUR-PROJECT/settings/api')
    }

    throw new Error('Client environment validation failed:\n' + formatted)
  }

  // Log successful validation in development
  if (isDev) {
    console.log('✅ Client environment variables validated successfully')
    console.log(`🗄️ Supabase URL: ${parsed.data.NEXT_PUBLIC_SUPABASE_URL}`)
    console.log(`🌐 App URL: ${parsed.data.NEXT_PUBLIC_APP_URL}`)
  }

  return parsed.data
}

