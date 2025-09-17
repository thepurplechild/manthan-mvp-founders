import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { getServerEnv } from '@/lib/env'

let admin: SupabaseClient | null = null

export function getAdminClient(): SupabaseClient {
  if (admin) return admin
  const env = getServerEnv()
  // NEXT_PUBLIC_SUPABASE_URL is safe to read directly; server validator checks service key
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return admin
}
