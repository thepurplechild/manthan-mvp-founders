/**
 * API Route: Sign In with Verification Checks
 * POST /api/auth/signin
 *
 * Handles user sign-in with comprehensive verification status checks
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createServerClient, validateServerEnvironment } from '@/lib/supabase/api-server';
import { checkRateLimit, validateEmail, logSecurityEvent } from '@/lib/auth/security';
import type { VerificationState } from '@/lib/auth/verification';

interface SignInRequest {
  email: string;
  password: string;
}

interface SignInResponse {
  success: boolean;
  data?: {
    user: {
      id: string;
      email: string;
    } | null;
    verificationStatus: {
      state: VerificationState;
      hasAcceptedRights: boolean;
      emailConfirmed: boolean;
      canSignIn: boolean;
      nextAction: string;
      message: string;
    };
    redirectTo: string;
  };
  error?: string;
  rateLimited?: boolean;
  remainingAttempts?: number;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SignInResponse>
) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  try {
    // Validate environment
    validateServerEnvironment();

    // Get client IP for rate limiting
    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
                     req.connection.remoteAddress ||
                     '127.0.0.1';

    // Check rate limiting
    const rateLimit = await checkRateLimit(clientIp, 'signIn');
    if (!rateLimit.allowed) {
      logSecurityEvent('rate_limit_exceeded', {
        operation: 'signIn',
        ip: clientIp,
        remainingAttempts: rateLimit.remainingAttempts
      }, clientIp, req.headers['user-agent']);

      return res.status(429).json({
        success: false,
        error: rateLimit.message || 'Too many sign-in attempts. Please try again later.',
        rateLimited: true,
        remainingAttempts: rateLimit.remainingAttempts
      });
    }

    // Parse and validate request body
    const { email, password }: SignInRequest = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required'
      });
    }

    // Validate email format
    const emailValidation = validateEmail(email);
    if (!emailValidation.valid) {
      return res.status(400).json({
        success: false,
        error: emailValidation.reason || 'Invalid email format'
      });
    }

    // Create server client
    const supabase = createServerClient(req);

    // Attempt sign in
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError || !authData.user) {
      // Log failed attempt
      logSecurityEvent('invalid_credentials', {
        email,
        error: authError?.message
      }, clientIp, req.headers['user-agent']);

      // Handle specific error cases
      if (authError?.message.includes('Email not confirmed') ||
          authError?.message.includes('email_not_confirmed')) {
        return res.status(403).json({
          success: false,
          error: 'Please check your email and click the confirmation link before signing in.',
          data: {
            user: null,
            verificationStatus: {
              state: 'pending_verification' as VerificationState,
              hasAcceptedRights: false,
              emailConfirmed: false,
              canSignIn: false,
              nextAction: 'Verify your email address',
              message: 'Please check your email and click the confirmation link before signing in.'
            },
            redirectTo: '/auth/login?error=email_not_confirmed'
          }
        });
      }

      if (authError?.message.includes('Invalid login credentials')) {
        return res.status(401).json({
          success: false,
          error: 'Invalid email or password. If you just signed up, make sure you\'ve confirmed your email first.',
          remainingAttempts: rateLimit.remainingAttempts - 1
        });
      }

      return res.status(401).json({
        success: false,
        error: authError?.message || 'Sign in failed',
        remainingAttempts: rateLimit.remainingAttempts - 1
      });
    }

    const user = authData.user;
    const emailConfirmed = !!user.email_confirmed_at;

    // Check rights acceptance if email is confirmed
    let hasAcceptedRights = false;
    if (emailConfirmed) {
      try {
        const { data: rightsData, error: rightsError } = await supabase
          .from('creator_rights_acceptances')
          .select('id')
          .eq('user_id', user.id)
          .single();

        if (!rightsError && rightsData) {
          hasAcceptedRights = true;
        }
      } catch (error) {
        console.warn('Could not check rights acceptance:', error);
      }
    }

    // Determine verification state and redirect
    let state: VerificationState;
    let nextAction: string;
    let message: string;
    let redirectTo: string;

    if (!emailConfirmed) {
      state = 'pending_verification';
      nextAction = 'Verify your email address';
      message = 'Please check your email and click the confirmation link.';
      redirectTo = '/auth/login?error=email_not_confirmed';
    } else if (!hasAcceptedRights) {
      state = 'verified_no_rights';
      nextAction = 'Accept the Creator\'s Bill of Rights';
      message = 'Email verified! Please accept our Creator\'s Bill of Rights to continue.';
      redirectTo = '/auth/accept-rights?signin=true';
    } else {
      state = 'verified_with_rights';
      nextAction = 'Access your dashboard';
      message = 'Sign in successful! Welcome back.';
      redirectTo = '/dashboard';
    }

    // Log successful sign in
    logSecurityEvent('successful_login', {
      userId: user.id,
      email: user.email,
      verificationState: state
    }, clientIp, req.headers['user-agent']);

    return res.status(200).json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email || ''
        },
        verificationStatus: {
          state,
          hasAcceptedRights,
          emailConfirmed,
          canSignIn: true,
          nextAction,
          message
        },
        redirectTo
      }
    });

  } catch (error) {
    console.error('Sign in API error:', error);

    logSecurityEvent('signin_error', {
      error: error instanceof Error ? error.message : 'Unknown error'
    }, req.connection.remoteAddress, req.headers['user-agent']);

    return res.status(500).json({
      success: false,
      error: 'Internal server error. Please try again.'
    });
  }
}