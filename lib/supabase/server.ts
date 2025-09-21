import { cookies } from 'next/headers';
import { createClient as supabaseCreateClient, type SupabaseClient } from '@supabase/supabase-js';

// Re-export createClient for compatibility
export { createClient } from '@supabase/supabase-js';

let adminClient: SupabaseClient | null = null;

export function getServerClient(): SupabaseClient {
  if (adminClient) return adminClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRole) {
    throw new Error('Missing Supabase admin environment variables.');
  }

  adminClient = supabaseCreateClient(url, serviceRole, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return adminClient;
}

export async function getRlsServerClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error('Missing Supabase RLS environment variables.');
  }

  return supabaseCreateClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: true,
    },
    global: {
      headers: {
        Cookie: cookieStore.getAll().map(({ name, value }) => `${name}=${value}`).join('; '),
      },
    },
  });
}
