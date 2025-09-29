/**
 * Supabase Client for Client Components
 *
 * This file creates a Supabase client for use in Client Components only
 * (components that use the 'use client' directive).
 *
 * Use this client for:
 * - Client-side authentication flows
 * - Real-time subscriptions
 * - Client-side data fetching
 * - Interactive components that need auth state
 *
 * DO NOT use this in Server Components or API routes.
 * For server-side usage, use utils/supabase/server.ts instead.
 */

import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/database'

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}