/**
 * API Route: Get User Verification Status
 * GET /api/auth/verification-status
 *
 * Returns comprehensive verification status for the authenticated user
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createServerClient, validateServerEnvironment } from '@/lib/supabase/api-server';
import type { VerificationState } from '@/lib/auth/verification';

interface VerificationStatusResponse {
  success: boolean;
  data?: {
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
  };
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<VerificationStatusResponse>
) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  try {
    // Validate environment
    validateServerEnvironment();

    // Create server client with user context
    const supabase = createServerClient(req);

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return res.status(401).json({
        success: false,
        error: 'Not authenticated'
      });
    }

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
        // Don't fail the request, just assume no rights acceptance
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

    return res.status(200).json({
      success: true,
      data: {
        state,
        user: {
          id: user.id,
          email: user.email || '',
          emailConfirmed
        },
        hasAcceptedRights,
        canSignIn,
        nextAction,
        message
      }
    });

  } catch (error) {
    console.error('Verification status check error:', error);

    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
}