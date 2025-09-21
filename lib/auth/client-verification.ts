/**
 * Client-Side Email Verification and Authentication
 * Uses API routes for server operations - safe for client components
 */

import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';

/**
 * User verification states throughout the authentication journey
 */
export type VerificationState =
  | 'unregistered'          // User hasn't signed up yet
  | 'pending_verification'  // User signed up but hasn't verified email
  | 'verified_no_rights'    // Email verified but rights not accepted
  | 'verified_with_rights'  // Fully verified and ready to use the app
  | 'verification_expired'  // Verification token has expired
  | 'verification_failed';  // Verification attempt failed

/**
 * Detailed verification status with user information
 */
export interface VerificationStatus {
  state: VerificationState;
  user: {
    id: string;
    email: string;
    emailConfirmed: boolean;
  } | null;
  hasAcceptedRights: boolean;
  canSignIn: boolean;
  nextAction: string;
  message: string;
}

/**
 * Sign-in attempt result with detailed feedback
 */
export interface SignInResult {
  success: boolean;
  user: {
    id: string;
    email: string;
  } | null;
  verificationStatus: VerificationStatus;
  error?: string;
  redirectTo: string;
  rateLimited?: boolean;
  remainingAttempts?: number;
}

/**
 * Resend verification email result
 */
export interface ResendResult {
  success: boolean;
  message: string;
  error?: string;
  rateLimited?: boolean;
  remainingAttempts?: number;
}

/**
 * Get comprehensive verification status for the current user
 * Calls API route for server-side checks
 * @returns Promise<VerificationStatus> - Complete verification information
 */
export async function getVerificationStatus(): Promise<VerificationStatus> {
  try {
    // First check if user is authenticated client-side
    const supabase = createClient();
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session?.user) {
      return {
        state: 'unregistered',
        user: null,
        hasAcceptedRights: false,
        canSignIn: false,
        nextAction: 'Create an account to get started',
        message: 'Please sign up or sign in to continue.'
      };
    }

    // Call API route for server-side verification checks
    const response = await fetch('/api/auth/verification-status', {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        return {
          state: 'unregistered',
          user: null,
          hasAcceptedRights: false,
          canSignIn: false,
          nextAction: 'Sign in to your account',
          message: 'Please sign in to continue.'
        };
      }

      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();

    if (!result.success || !result.data) {
      throw new Error(result.error || 'Failed to get verification status');
    }

    return {
      state: result.data.state,
      user: result.data.user,
      hasAcceptedRights: result.data.hasAcceptedRights,
      canSignIn: result.data.canSignIn,
      nextAction: result.data.nextAction,
      message: result.data.message
    };

  } catch (error) {
    console.error('Error checking verification status:', error);

    return {
      state: 'verification_failed',
      user: null,
      hasAcceptedRights: false,
      canSignIn: false,
      nextAction: 'Try refreshing the page',
      message: 'Unable to check verification status. Please try again.'
    };
  }
}

/**
 * Attempt to sign in a user with verification status checks
 * Calls API route for server-side authentication
 * @param email - User's email address
 * @param password - User's password
 * @returns Promise<SignInResult> - Result of sign-in attempt with next steps
 */
export async function signInWithVerification(
  email: string,
  password: string
): Promise<SignInResult> {
  try {
    const response = await fetch('/api/auth/signin', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    const result = await response.json();

    if (response.ok && result.success) {
      return {
        success: true,
        user: result.data.user,
        verificationStatus: result.data.verificationStatus,
        redirectTo: result.data.redirectTo
      };
    }

    // Handle various error responses
    return {
      success: false,
      user: null,
      verificationStatus: result.data?.verificationStatus || {
        state: 'verification_failed' as VerificationState,
        user: null,
        hasAcceptedRights: false,
        canSignIn: false,
        nextAction: 'Try again',
        message: 'Sign in failed'
      },
      error: result.error || 'Sign in failed',
      redirectTo: result.data?.redirectTo || '/auth/login',
      rateLimited: result.rateLimited,
      remainingAttempts: result.remainingAttempts
    };

  } catch (error) {
    console.error('Sign in error:', error);

    return {
      success: false,
      user: null,
      verificationStatus: {
        state: 'verification_failed',
        user: null,
        hasAcceptedRights: false,
        canSignIn: false,
        nextAction: 'Check your connection',
        message: 'Network error occurred'
      },
      error: error instanceof Error ? error.message : 'Network error',
      redirectTo: '/auth/login'
    };
  }
}

/**
 * Resend verification email with enhanced error handling
 * Calls API route for server-side email sending
 * @param email - Email address to send verification to
 * @returns Promise<ResendResult> - Result of resend attempt
 */
export async function resendVerificationEmail(email: string): Promise<ResendResult> {
  try {
    const response = await fetch('/api/auth/resend-verification', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email }),
    });

    const result = await response.json();

    return {
      success: result.success,
      message: result.message,
      error: result.error,
      rateLimited: result.rateLimited,
      remainingAttempts: result.remainingAttempts
    };

  } catch (error) {
    console.error('Resend verification error:', error);

    return {
      success: false,
      message: 'Unable to send verification email. Please try again later.',
      error: error instanceof Error ? error.message : 'Network error'
    };
  }
}

/**
 * Check if a user needs to accept Creator's Bill of Rights
 * Uses current verification status
 * @returns Promise<boolean> - True if rights acceptance is needed
 */
export async function needsRightsAcceptance(): Promise<boolean> {
  try {
    const status = await getVerificationStatus();
    return status.state === 'verified_no_rights';
  } catch (error) {
    console.error('Rights acceptance check failed:', error);
    return true; // Default to requiring acceptance on error
  }
}

/**
 * Client-side only: Get current user session
 * Safe for use in client components
 * @returns Promise<User | null> - Current user or null
 */
export async function getCurrentUser(): Promise<User | null> {
  try {
    const supabase = createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error) {
      console.error('Error getting current user:', error);
      return null;
    }

    return user;
  } catch (error) {
    console.error('Get current user failed:', error);
    return null;
  }
}

/**
 * Client-side only: Sign out current user
 * Safe for use in client components
 * @returns Promise<boolean> - True if sign out successful
 */
export async function signOut(): Promise<boolean> {
  try {
    const supabase = createClient();
    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error('Sign out error:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Sign out failed:', error);
    return false;
  }
}