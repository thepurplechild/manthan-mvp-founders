/**
 * Pages Router Compatible Server-Side Supabase Client
 * For use in API routes only - NO next/headers dependency
 */

import { createClient as supabaseCreateClient, type SupabaseClient } from '@supabase/supabase-js';
import type { NextApiRequest } from 'next';

/**
 * Admin client for service-role operations (server-only)
 * Use for operations that bypass RLS
 */
let adminClient: SupabaseClient | null = null;

export function getAdminClient(): SupabaseClient {
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

/**
 * Create RLS-enabled client from API request cookies
 * Use for user-scoped operations in API routes
 * @param req - NextApiRequest with cookies
 * @returns SupabaseClient with user context from cookies
 */
export function createServerClient(req: NextApiRequest): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error('Missing Supabase environment variables.');
  }

  // Extract cookies from request (Pages Router compatible)
  const cookies = req.headers.cookie || '';

  return supabaseCreateClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        Cookie: cookies,
      },
    },
  });
}

/**
 * Validate environment variables for server operations
 * Call this in API routes to ensure proper configuration
 */
export function validateServerEnvironment(): void {
  const required = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY'
  ];

  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables for server operations: ${missing.join(', ')}`
    );
  }
}

/**
 * Helper to extract user ID from server client
 * @param req - NextApiRequest
 * @returns Promise<string | null> - User ID or null if not authenticated
 */
export async function getUserIdFromRequest(req: NextApiRequest): Promise<string | null> {
  try {
    const supabase = createServerClient(req);
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return null;
    }

    return user.id;
  } catch (error) {
    console.error('Error extracting user ID from request:', error);
    return null;
  }
}