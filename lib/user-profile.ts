/**
 * Server-Side User Profile Management
 *
 * This module provides utilities for fetching user profile data including role information
 * on the server side. It's designed to work with layouts and Server Components for
 * implementing role-based access control (RBAC).
 *
 * IMPORTANT: These functions can only be called in Server Components, Server Actions,
 * or Route Handlers. Do NOT use in Client Components.
 */

import { createClient } from '@/utils/supabase/server'

/**
 * User profile data structure returned from the database
 */
export interface UserProfile {
  /** Unique user identifier (matches auth.users.id) */
  id: string
  /** User's display name */
  full_name: string | null
  /** User's role in the system - determines access permissions */
  role: 'creator' | 'founder'
  /** When the user profile was created */
  created_at: string
}

/**
 * Fetches the current authenticated user's profile data including role information.
 *
 * This function handles the complete flow of:
 * 1. Getting the authenticated user from Supabase Auth
 * 2. Querying the profiles table for role and profile data
 * 3. Returning type-safe profile data or null if not found
 *
 * @returns Promise that resolves to UserProfile if user is authenticated and has a profile, null otherwise
 *
 * @example
 * ```typescript
 * // In a Server Component or layout
 * const profile = await getUserProfile()
 * if (!profile) {
 *   redirect('/login')
 * }
 *
 * if (profile.role !== 'creator') {
 *   redirect('/unauthorized')
 * }
 * ```
 */
export async function getUserProfile(): Promise<UserProfile | null> {
  try {
    // Create Supabase server client
    const supabase = await createClient()

    // Get the authenticated user from Supabase Auth
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    // Return null if no authenticated user or auth error
    if (authError || !user) {
      return null
    }

    // Query the profiles table for role and profile information
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name, role, created_at')
      .eq('id', user.id)
      .single()

    // Return null if profile query fails or no profile found
    if (profileError || !profile) {
      return null
    }

    // Type-safe return with explicit role typing
    return {
      id: (profile as any).id,
      full_name: (profile as any).full_name,
      role: (profile as any).role as 'creator' | 'founder', // Explicit type assertion for safety
      created_at: (profile as any).created_at,
    }

  } catch (error) {
    // Log error for debugging but return null for consistent error handling
    console.error('[getUserProfile] Unexpected error:', error)
    return null
  }
}

/**
 * Type guard to check if a user has a specific role.
 * Useful for conditional rendering and authorization checks.
 *
 * @param profile - The user profile to check
 * @param role - The role to check for
 * @returns Boolean indicating if the user has the specified role
 *
 * @example
 * ```typescript
 * const profile = await getUserProfile()
 * if (profile && hasRole(profile, 'founder')) {
 *   // Show founder-only content
 * }
 * ```
 */
export function hasRole(profile: UserProfile | null, role: 'creator' | 'founder'): boolean {
  return profile?.role === role
}

/**
 * Checks if the current user is a founder.
 * Convenience function for common authorization checks.
 *
 * @param profile - The user profile to check
 * @returns Boolean indicating if the user is a founder
 */
export function isFounder(profile: UserProfile | null): boolean {
  return hasRole(profile, 'founder')
}

/**
 * Checks if the current user is a creator.
 * Convenience function for common authorization checks.
 *
 * @param profile - The user profile to check
 * @returns Boolean indicating if the user is a creator
 */
export function isCreator(profile: UserProfile | null): boolean {
  return hasRole(profile, 'creator')
}