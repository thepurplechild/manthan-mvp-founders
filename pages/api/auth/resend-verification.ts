/**
 * API Route: Resend Email Verification
 * POST /api/auth/resend-verification
 *
 * Resends verification email with rate limiting and security measures
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createServerClient, validateServerEnvironment } from '@/lib/supabase/api-server';
import { checkRateLimit, validateEmail, logSecurityEvent } from '@/lib/auth/security';

interface ResendRequest {
  email: string;
}

interface ResendResponse {
  success: boolean;
  message: string;
  error?: string;
  rateLimited?: boolean;
  remainingAttempts?: number;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResendResponse>
) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed'
    });
  }

  try {
    // Validate environment
    validateServerEnvironment();

    // Get client IP for rate limiting
    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
                     req.connection.remoteAddress ||
                     '127.0.0.1';

    // Check rate limiting for email resends
    const rateLimit = await checkRateLimit(clientIp, 'resendEmail');
    if (!rateLimit.allowed) {
      logSecurityEvent('rate_limit_exceeded', {
        operation: 'resendEmail',
        ip: clientIp,
        remainingAttempts: rateLimit.remainingAttempts
      }, clientIp, req.headers['user-agent']);

      return res.status(429).json({
        success: false,
        message: rateLimit.message || 'Too many resend attempts. Please wait before trying again.',
        rateLimited: true,
        remainingAttempts: rateLimit.remainingAttempts
      });
    }

    // Parse and validate request body
    const { email }: ResendRequest = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email address is required'
      });
    }

    // Validate email format
    const emailValidation = validateEmail(email);
    if (!emailValidation.valid) {
      return res.status(400).json({
        success: false,
        message: emailValidation.reason || 'Invalid email format'
      });
    }

    // Create server client
    const supabase = createServerClient(req);

    // Attempt to resend verification email
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: {
        emailRedirectTo: `${req.headers.origin || process.env.NEXT_PUBLIC_BASE_URL}/auth/confirm?next=/dashboard`
      },
    });

    if (error) {
      // Log failed resend attempt
      logSecurityEvent('resend_failed', {
        email,
        error: error.message
      }, clientIp, req.headers['user-agent']);

      // Handle specific error cases
      if (error.message.includes('rate limit') || error.message.includes('too many')) {
        return res.status(429).json({
          success: false,
          message: 'Please wait a moment before requesting another verification email.',
          error: 'Rate limited by email provider'
        });
      }

      if (error.message.includes('not found') || error.message.includes('invalid')) {
        return res.status(404).json({
          success: false,
          message: 'No account found with this email address. Please sign up first.',
          error: 'User not found'
        });
      }

      return res.status(400).json({
        success: false,
        message: 'Failed to send verification email. Please try again.',
        error: error.message
      });
    }

    // Log successful resend
    logSecurityEvent('verification_resent', {
      email
    }, clientIp, req.headers['user-agent']);

    return res.status(200).json({
      success: true,
      message: 'Verification email sent! Check your inbox and spam folder.'
    });

  } catch (error) {
    console.error('Resend verification API error:', error);

    logSecurityEvent('resend_error', {
      error: error instanceof Error ? error.message : 'Unknown error'
    }, req.connection.remoteAddress, req.headers['user-agent']);

    return res.status(500).json({
      success: false,
      message: 'Unable to send verification email. Please try again later.',
      error: 'Internal server error'
    });
  }
}