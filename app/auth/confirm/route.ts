import { type EmailOtpType } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * 🔐 Enhanced Email Verification Handler
 *
 * Processes email verification links with comprehensive validation,
 * error handling, and security measures. Handles both PKCE and legacy
 * token flows with proper fallback mechanisms.
 */

interface VerificationAttempt {
  hasCode: boolean;
  hasTokenHash: boolean;
  type: string | null;
  timestamp: string;
  userAgent?: string;
  ip?: string;
}

interface VerificationResult {
  success: boolean;
  state: 'verified_with_rights' | 'verified_no_rights' | 'verification_failed' | 'invalid_token' | 'expired_token';
  user?: any;
  error?: string;
  redirectTo: string;
}

/**
 * Validate and sanitize verification parameters
 */
function validateVerificationParams(searchParams: URLSearchParams): {
  isValid: boolean;
  errors: string[];
  params: {
    code?: string;
    token_hash?: string;
    type?: EmailOtpType;
    next?: string;
  };
} {
  const errors: string[] = [];
  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") || "/dashboard";

  // Validate that we have at least one verification method
  if (!code && !token_hash) {
    errors.push("Missing verification parameters");
  }

  // If we have neither code nor token_hash, check for additional auth patterns
  if (!code && !token_hash) {
    // Check for access_token in the request (might be in URL fragments)
    const access_token = searchParams.get("access_token");
    const refresh_token = searchParams.get("refresh_token");

    if (access_token && refresh_token) {
      // This should be handled by the callback route, redirect there
      console.log('Redirecting token-based auth to callback route');
      return {
        isValid: false,
        errors: ["Token-based authentication should use /auth/callback"],
        params: { next }
      };
    }
  }

  // Validate code format if present (PKCE codes are typically base64url)
  if (code && !/^[A-Za-z0-9_-]+$/.test(code)) {
    errors.push("Invalid verification code format");
  }

  // Validate token_hash format if present
  if (token_hash && !/^[A-Fa-f0-9]+$/.test(token_hash)) {
    errors.push("Invalid token hash format");
  }

  // Validate type if using legacy flow
  if (token_hash && !type) {
    errors.push("Token type required for legacy verification");
  }

  // Validate redirect URL
  try {
    if (next && !next.startsWith('/')) {
      errors.push("Invalid redirect URL");
    }
  } catch {
    errors.push("Malformed redirect URL");
  }

  return {
    isValid: errors.length === 0,
    errors,
    params: {
      code: code || undefined,
      token_hash: token_hash || undefined,
      type: type || undefined,
      next
    }
  };
}

/**
 * Create Supabase client for verification
 */
async function createVerificationClient() {
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          // Note: We can't set cookies in this context, but we can read them
        },
      },
    }
  );

  return supabase;
}

/**
 * Process email verification with comprehensive error handling
 */
async function processVerification(params: {
  code?: string;
  token_hash?: string;
  type?: EmailOtpType;
}): Promise<VerificationResult> {
  const supabase = await createVerificationClient();

  try {
    let result: any = null;
    let error: any = null;

    // Try PKCE flow first (newer, more secure)
    if (params.code) {
      console.log('🔄 Attempting PKCE verification flow...');
      result = await supabase.auth.exchangeCodeForSession(params.code);
      error = result.error;
    }
    // Fallback to legacy token flow
    else if (params.token_hash && params.type) {
      console.log('🔄 Attempting legacy token verification flow...');
      result = await supabase.auth.verifyOtp({
        type: params.type,
        token_hash: params.token_hash
      });
      error = result.error;
    }

    if (error) {
      console.error('❌ Verification failed:', error);

      // Categorize errors for better user experience
      if (error.message.includes('expired') || error.message.includes('Invalid token')) {
        return {
          success: false,
          state: 'expired_token',
          error: 'Your verification link has expired. Please request a new one.',
          redirectTo: '/auth/error?error_type=expired&action=resend'
        };
      }

      if (error.message.includes('invalid') || error.message.includes('malformed')) {
        return {
          success: false,
          state: 'invalid_token',
          error: 'Invalid verification link. Please check the link and try again.',
          redirectTo: '/auth/error?error_type=invalid&action=retry'
        };
      }

      return {
        success: false,
        state: 'verification_failed',
        error: error.message,
        redirectTo: '/auth/error?error_type=generic&action=contact'
      };
    }

    if (!result?.data?.user) {
      return {
        success: false,
        state: 'verification_failed',
        error: 'No user data returned from verification',
        redirectTo: '/auth/error?error_type=system&action=retry'
      };
    }

    const user = result.data.user;
    console.log('✅ Email verification successful for user:', user.id);

    // Check if user has accepted Creator's Bill of Rights
    const { data: rightsData, error: rightsError } = await supabase
      .from('creator_rights_acceptances')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (rightsError && rightsError.code !== 'PGRST116') {
      console.warn('⚠️ Error checking rights acceptance:', rightsError);
    }

    const hasAcceptedRights = !!rightsData;

    return {
      success: true,
      state: hasAcceptedRights ? 'verified_with_rights' : 'verified_no_rights',
      user,
      redirectTo: hasAcceptedRights ? '/dashboard' : '/auth/accept-rights?verified=true'
    };

  } catch (catchError) {
    console.error('💥 Verification processing error:', catchError);
    return {
      success: false,
      state: 'verification_failed',
      error: catchError instanceof Error ? catchError.message : 'Unexpected error',
      redirectTo: '/auth/error?error_type=system&action=retry'
    };
  }
}

/**
 * Log verification attempt for monitoring and debugging
 */
function logVerificationAttempt(request: NextRequest, attempt: VerificationAttempt, result: VerificationResult) {
  const logData = {
    timestamp: attempt.timestamp,
    ip: attempt.ip,
    userAgent: attempt.userAgent,
    hasCode: attempt.hasCode,
    hasTokenHash: attempt.hasTokenHash,
    type: attempt.type,
    success: result.success,
    state: result.state,
    error: result.error,
    userId: result.user?.id
  };

  // In production, send to monitoring service (Sentry, LogRocket, etc.)
  console.log('📊 Verification attempt logged:', JSON.stringify(logData, null, 2));

  // TODO: Add monitoring service integration
  // await sendToMonitoring('email_verification_attempt', logData);
}

export async function GET(request: NextRequest) {
  const startTime = performance.now();
  const { searchParams } = new URL(request.url);

  // Extract client information for logging
  const userAgent = request.headers.get('user-agent');
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0] : undefined;

  const attempt: VerificationAttempt = {
    hasCode: !!searchParams.get("code"),
    hasTokenHash: !!searchParams.get("token_hash"),
    type: searchParams.get("type"),
    timestamp: new Date().toISOString(),
    userAgent: userAgent || undefined,
    ip: ip || undefined
  };

  console.log('🚀 Email verification attempt started:', attempt);

  try {
    // Validate input parameters
    const validation = validateVerificationParams(searchParams);
    if (!validation.isValid) {
      const errorMsg = `Invalid verification parameters: ${validation.errors.join(', ')}`;
      const result: VerificationResult = {
        success: false,
        state: 'invalid_token',
        error: errorMsg,
        redirectTo: '/auth/error?error_type=invalid&action=retry'
      };

      logVerificationAttempt(request, attempt, result);

      const errorUrl = new URL(result.redirectTo, request.url);
      errorUrl.searchParams.set('error', errorMsg);
      return NextResponse.redirect(errorUrl);
    }

    // Process verification
    const result = await processVerification(validation.params);

    // Log the attempt
    logVerificationAttempt(request, attempt, result);

    if (result.success) {
      console.log(`✅ Verification completed successfully in ${(performance.now() - startTime).toFixed(2)}ms`);

      // Build success redirect URL with context
      const successUrl = new URL(result.redirectTo, request.url);

      if (result.state === 'verified_with_rights') {
        successUrl.searchParams.set('verified', 'true');
        successUrl.searchParams.set('welcome', 'true');
      } else if (result.state === 'verified_no_rights') {
        successUrl.searchParams.set('verified', 'true');
        successUrl.searchParams.set('needs_rights', 'true');
      }

      return NextResponse.redirect(successUrl);
    } else {
      console.error(`❌ Verification failed in ${(performance.now() - startTime).toFixed(2)}ms:`, result.error);

      // Build error redirect URL with detailed context
      const errorUrl = new URL(result.redirectTo, request.url);
      errorUrl.searchParams.set('error', result.error || 'Verification failed');

      return NextResponse.redirect(errorUrl);
    }

  } catch (error) {
    console.error('💥 Fatal verification handler error:', error);

    const errorResult: VerificationResult = {
      success: false,
      state: 'verification_failed',
      error: error instanceof Error ? error.message : 'System error',
      redirectTo: '/auth/error?error_type=system&action=contact'
    };

    logVerificationAttempt(request, attempt, errorResult);

    const errorUrl = new URL('/auth/error', request.url);
    errorUrl.searchParams.set('error', errorResult.error || 'System error');
    errorUrl.searchParams.set('error_type', 'system');
    errorUrl.searchParams.set('action', 'contact');

    return NextResponse.redirect(errorUrl);
  }
}