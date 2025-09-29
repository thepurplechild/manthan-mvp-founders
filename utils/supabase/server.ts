/**
 * Supabase Client for Server Components
 *
 * This file creates a Supabase client for use in Server Components, Server Actions,
 * and API Route Handlers only.
 *
 * Use this client for:
 * - Server Components data fetching
 * - API route handlers
 * - Server Actions
 * - Middleware (when needed)
 *
 * This client properly handles cookies for SSR and maintains user sessions
 * across server-side rendering cycles.
 *
 * DO NOT use this in Client Components.
 * For client-side usage, use utils/supabase/client.ts instead.
 */

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/types/database'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: any) {
          try {
            cookieStore.set({ name, value, ...options })
          } catch (error) {
            // The `set` method can fail in certain contexts (e.g., when called during static generation)
            // This is expected behavior and can be safely ignored
          }
        },
        remove(name: string, options: any) {
          try {
            cookieStore.set({ name, value: '', ...options })
          } catch (error) {
            // The `remove` method can fail in certain contexts (e.g., when called during static generation)
            // This is expected behavior and can be safely ignored
          }
        },
      },
    }
  )
}