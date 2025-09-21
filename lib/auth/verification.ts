/**
 * Email Verification and Authentication State Management
 * Handles the complete user verification journey with Supabase Auth
 */

import { createClient } from '@/lib/supabase/client';
import { getRlsServerClient } from '@/lib/supabase/server';
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
  user: User | null;
  hasAcceptedRights: boolean;
  emailConfirmed: boolean;
  canSignIn: boolean;
  nextAction: string;
  message: string;
}

/**
 * Email verification result from processing verification links
 */
export interface VerificationResult {
  success: boolean;
  state: VerificationState;
  user: User | null;
  error?: string;
  redirectTo: string;
}

/**
 * Sign-in attempt result with detailed feedback
 */
export interface SignInResult {
  success: boolean;
  user: User | null;
  verificationStatus: VerificationStatus;
  error?: string;
  redirectTo: string;
}

/**
 * Get comprehensive verification status for a user
 * @param userEmail - Email to check verification status for
 * @returns Promise<VerificationStatus> - Complete verification information
 */
export async function getVerificationStatus(userEmail?: string): Promise<VerificationStatus> {
  const supabase = createClient();

  try {
    // Get current user session
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError && userEmail) {
      // No session but email provided - check if user exists
      return {
        state: 'unregistered',
        user: null,
        hasAcceptedRights: false,
        emailConfirmed: false,
        canSignIn: false,
        nextAction: 'Sign up with this email address',
        message: 'No account found with this email address.'
      };
    }

    if (!user) {
      return {
        state: 'unregistered',
        user: null,
        hasAcceptedRights: false,
        emailConfirmed: false,
        canSignIn: false,
        nextAction: 'Create an account to get started',
        message: 'Please sign up or sign in to continue.'
      };
    }

    const emailConfirmed = !!user.email_confirmed_at;

    // Check rights acceptance if email is confirmed
    let hasAcceptedRights = false;
    if (emailConfirmed) {
      try {
        const { data: rightsData } = await supabase
          .from('creator_rights_acceptances')
          .select('id')
          .eq('user_id', user.id)
          .single();

        hasAcceptedRights = !!rightsData;
      } catch (error) {
        console.warn('Could not check rights acceptance:', error);
      }
    }

    // Determine verification state
    let state: VerificationState;
    let nextAction: string;
    let message: string;
    let canSignIn: boolean;

    if (!emailConfirmed) {
      state = 'pending_verification';
      nextAction = 'Check your email and click the verification link';
      message = 'Please verify your email address to continue.';
      canSignIn = false;
    } else if (!hasAcceptedRights) {
      state = 'verified_no_rights';
      nextAction = 'Accept the Creator\'s Bill of Rights';
      message = 'Email verified! Please accept our Creator\'s Bill of Rights to continue.';
      canSignIn = true; // Can sign in but will be redirected to rights acceptance
    } else {
      state = 'verified_with_rights';
      nextAction = 'Access your dashboard';
      message = 'Your account is fully verified and ready to use.';
      canSignIn = true;
    }

    return {
      state,
      user,
      hasAcceptedRights,
      emailConfirmed,
      canSignIn,
      nextAction,
      message
    };

  } catch (error) {
    console.error('Error checking verification status:', error);
    return {
      state: 'verification_failed',
      user: null,
      hasAcceptedRights: false,
      emailConfirmed: false,
      canSignIn: false,
      nextAction: 'Try refreshing the page',
      message: 'Unable to check verification status. Please try again.'
    };
  }
}

/**
 * Process email verification from confirmation link
 * @param code - Verification code from email link
 * @param tokenHash - Legacy token hash (fallback)
 * @param type - Type of verification
 * @returns Promise<VerificationResult> - Result of verification attempt
 */
export async function processEmailVerification(
  code?: string | null,
  tokenHash?: string | null,
  type?: string | null
): Promise<VerificationResult> {
  const supabase = createClient();

  try {
    let user: User | null = null;
    let error: any = null;

    // Try new code flow first (PKCE)
    if (code) {
      const result = await supabase.auth.exchangeCodeForSession(code);
      user = result.data.user;
      error = result.error;
    }
    // Fallback to legacy token flow
    else if (tokenHash && type) {
      const result = await supabase.auth.verifyOtp({
        type: type as any,
        token_hash: tokenHash
      });
      user = result.data.user;
      error = result.error;
    }

    if (error) {
      return {
        success: false,
        state: 'verification_failed',
        user: null,
        error: error.message,
        redirectTo: '/auth/error?error=' + encodeURIComponent(error.message)
      };
    }

    if (!user) {
      return {
        success: false,
        state: 'verification_failed',
        user: null,
        error: 'No user returned from verification',
        redirectTo: '/auth/error?error=Verification failed'
      };
    }

    // Check rights acceptance status
    const verificationStatus = await getVerificationStatus();

    if (verificationStatus.state === 'verified_with_rights') {
      return {
        success: true,
        state: 'verified_with_rights',
        user,
        redirectTo: '/dashboard'
      };
    } else {
      return {
        success: true,
        state: 'verified_no_rights',
        user,
        redirectTo: '/auth/accept-rights?verified=true'
      };
    }

  } catch (error) {
    console.error('Email verification error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Verification failed';

    return {
      success: false,
      state: 'verification_failed',
      user: null,
      error: errorMessage,
      redirectTo: '/auth/error?error=' + encodeURIComponent(errorMessage)
    };
  }
}

/**
 * Attempt to sign in a user with verification status checks
 * @param email - User's email address
 * @param password - User's password
 * @returns Promise<SignInResult> - Result of sign-in attempt with next steps
 */
export async function signInWithVerification(
  email: string,
  password: string
): Promise<SignInResult> {
  const supabase = createClient();

  try {
    // Attempt sign in
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      // Handle specific error cases
      if (error.message.includes('Email not confirmed') ||
          error.message.includes('email_not_confirmed')) {
        const verificationStatus = await getVerificationStatus(email);
        return {
          success: false,
          user: null,
          verificationStatus: {
            ...verificationStatus,
            state: 'pending_verification',
            message: 'Please check your email and click the confirmation link before signing in.',
            nextAction: 'Verify your email address'
          },
          error: 'Email verification required',
          redirectTo: '/auth/login?error=email_not_confirmed'
        };
      }

      if (error.message.includes('Invalid login credentials')) {
        const verificationStatus = await getVerificationStatus(email);
        return {
          success: false,
          user: null,
          verificationStatus,
          error: 'Invalid email or password',
          redirectTo: '/auth/login?error=invalid_credentials'
        };
      }

      // Generic error
      const verificationStatus = await getVerificationStatus(email);
      return {
        success: false,
        user: null,
        verificationStatus,
        error: error.message,
        redirectTo: '/auth/login?error=' + encodeURIComponent(error.message)
      };
    }

    if (!data.user) {
      const verificationStatus = await getVerificationStatus(email);
      return {
        success: false,
        user: null,
        verificationStatus,
        error: 'Sign in failed - no user returned',
        redirectTo: '/auth/login?error=signin_failed'
      };
    }

    // Get verification status for successful sign in
    const verificationStatus = await getVerificationStatus();

    // Determine where to redirect based on verification state
    let redirectTo: string;
    switch (verificationStatus.state) {
      case 'pending_verification':
        redirectTo = '/auth/login?error=email_not_confirmed';
        break;
      case 'verified_no_rights':
        redirectTo = '/auth/accept-rights?signin=true';
        break;
      case 'verified_with_rights':
        redirectTo = '/dashboard';
        break;
      default:
        redirectTo = '/dashboard';
    }

    return {
      success: true,
      user: data.user,
      verificationStatus,
      redirectTo
    };

  } catch (error) {
    console.error('Sign in error:', error);
    const verificationStatus = await getVerificationStatus(email);
    const errorMessage = error instanceof Error ? error.message : 'Sign in failed';

    return {
      success: false,
      user: null,
      verificationStatus,
      error: errorMessage,
      redirectTo: '/auth/login?error=' + encodeURIComponent(errorMessage)
    };
  }
}

/**
 * Resend verification email with enhanced error handling
 * @param email - Email address to send verification to
 * @returns Promise<{success: boolean, message: string, error?: string}>
 */
export async function resendVerificationEmail(email: string): Promise<{
  success: boolean;
  message: string;
  error?: string;
}> {
  const supabase = createClient();

  try {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/confirm?next=/dashboard`
      },
    } as any);

    if (error) {
      if (error.message.includes('rate limit')) {
        return {
          success: false,
          message: 'Please wait a moment before requesting another verification email.',
          error: 'Rate limited'
        };
      }

      return {
        success: false,
        message: 'Failed to send verification email. Please try again.',
        error: error.message
      };
    }

    return {
      success: true,
      message: 'Verification email sent! Check your inbox and spam folder.'
    };

  } catch (error) {
    console.error('Resend verification error:', error);
    return {
      success: false,
      message: 'Unable to send verification email. Please try again later.',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Check if a user needs to accept Creator's Bill of Rights
 * @param userId - User ID to check
 * @returns Promise<boolean> - True if rights acceptance is needed
 */
export async function needsRightsAcceptance(userId: string): Promise<boolean> {
  try {
    const supabase = await getRlsServerClient();

    const { data, error } = await supabase
      .from('creator_rights_acceptances')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
      console.error('Error checking rights acceptance:', error);
      return true; // Default to requiring acceptance on error
    }

    return !data; // Need acceptance if no record found
  } catch (error) {
    console.error('Rights acceptance check failed:', error);
    return true; // Default to requiring acceptance on error
  }
}