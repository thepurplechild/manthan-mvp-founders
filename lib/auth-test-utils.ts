/**
 * Authentication Testing Utilities
 *
 * This file provides utilities for testing the authentication and authorization flow.
 * Use these functions to verify that role-based access control is working correctly.
 *
 * IMPORTANT: These are for development/testing purposes only.
 * Remove or secure these functions before production deployment.
 */

import { getUserProfile, UserProfile } from './user-profile'

/**
 * Test scenarios for role-based access control
 */
export interface AuthTestScenario {
  description: string
  expectedRole: 'creator' | 'founder' | null
  allowedRoutes: string[]
  blockedRoutes: string[]
}

/**
 * Predefined test scenarios for different user types
 */
export const AUTH_TEST_SCENARIOS: AuthTestScenario[] = [
  {
    description: 'Unauthenticated user',
    expectedRole: null,
    allowedRoutes: ['/auth/login', '/auth/signup', '/'],
    blockedRoutes: ['/dashboard', '/projects', '/founder/dashboard', '/founder/projects']
  },
  {
    description: 'Creator user',
    expectedRole: 'creator',
    allowedRoutes: ['/dashboard', '/projects', '/projects/new', '/projects/[id]/upload'],
    blockedRoutes: ['/founder/dashboard', '/founder/projects', '/auth/login', '/auth/signup']
  },
  {
    description: 'Founder user',
    expectedRole: 'founder',
    allowedRoutes: ['/founder/dashboard', '/founder/projects', '/founder/mandates'],
    blockedRoutes: ['/dashboard', '/projects', '/auth/login', '/auth/signup']
  }
]

/**
 * Validates that the current user's profile matches expected test conditions
 *
 * @param expectedRole - The role that the current user should have
 * @returns Promise that resolves to test result information
 */
export async function validateAuthState(expectedRole: 'creator' | 'founder' | null): Promise<{
  success: boolean
  actualProfile: UserProfile | null
  expectedRole: typeof expectedRole
  message: string
}> {
  try {
    const actualProfile = await getUserProfile()

    // Test for unauthenticated user
    if (expectedRole === null) {
      const success = actualProfile === null
      return {
        success,
        actualProfile,
        expectedRole,
        message: success
          ? 'User is correctly unauthenticated'
          : `Expected no user, but found user with role: ${actualProfile?.role}`
      }
    }

    // Test for authenticated user with specific role
    if (!actualProfile) {
      return {
        success: false,
        actualProfile,
        expectedRole,
        message: `Expected authenticated user with role '${expectedRole}', but user is not authenticated`
      }
    }

    const success = actualProfile.role === expectedRole
    return {
      success,
      actualProfile,
      expectedRole,
      message: success
        ? `User correctly has role: ${actualProfile.role}`
        : `Expected role '${expectedRole}', but user has role '${actualProfile.role}'`
    }

  } catch (error) {
    return {
      success: false,
      actualProfile: null,
      expectedRole,
      message: `Auth state validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    }
  }
}

/**
 * Route protection test matrix
 *
 * This helps verify that the layout-based protection is working correctly.
 */
export const ROUTE_PROTECTION_MATRIX = {
  // Public routes (accessible to all)
  public: [
    '/',
    '/auth/login',
    '/auth/signup',
    '/auth/forgot-password'
  ],

  // Creator-only routes (protected by (creator) layout)
  creator: [
    '/dashboard',
    '/projects',
    '/projects/new',
    '/projects/[id]',
    '/projects/[id]/upload',
    '/projects/[id]/review'
  ],

  // Founder-only routes (protected by (founder) layout)
  founder: [
    '/founder/dashboard',
    '/founder/projects',
    '/founder/projects/[id]',
    '/founder/mandates',
    '/founder/mandates/new'
  ]
} as const

/**
 * Development helper to log current auth state
 * Use this in Server Components to debug authentication issues
 */
export async function logAuthState(context: string = 'Unknown'): Promise<void> {
  if (process.env.NODE_ENV !== 'development') {
    return // Only log in development
  }

  try {
    const profile = await getUserProfile()
    console.log(`[${context}] Auth State:`, {
      authenticated: !!profile,
      userId: profile?.id,
      role: profile?.role,
      fullName: profile?.full_name
    })
  } catch (error) {
    console.error(`[${context}] Auth State Error:`, error)
  }
}

/**
 * Type guard to ensure profile has expected role
 * Useful for TypeScript type narrowing in components
 */
export function assertRole<T extends 'creator' | 'founder'>(
  profile: UserProfile | null,
  expectedRole: T
): profile is UserProfile & { role: T } {
  return profile?.role === expectedRole
}