import { getRlsServerClient } from "@/lib/supabase/server";
import { processEmailVerification } from "@/lib/auth/verification";
import { type EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Enhanced Email Verification Handler
 * Processes email verification links with comprehensive state management
 * and proper redirect handling based on user verification status
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code"); // PKCE/OTP exchange code (newer flow)
  const next = searchParams.get("next") ?? "/dashboard";

  console.log('Email verification attempt:', {
    hasCode: !!code,
    hasTokenHash: !!token_hash,
    type,
    next,
    timestamp: new Date().toISOString()
  });

  try {
    // Use our enhanced verification processing
    const result = await processEmailVerification(code, token_hash, type);

    if (result.success) {
      console.log('Email verification successful:', {
        state: result.state,
        userId: result.user?.id,
        redirectTo: result.redirectTo
      });

      // Add verification success parameters to the redirect
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
      console.error('Email verification failed:', {
        error: result.error,
        state: result.state,
        redirectTo: result.redirectTo
      });

      // Enhanced error handling with specific error types
      const errorUrl = new URL(result.redirectTo, request.url);

      // Add additional context for better error messages
      if (result.error?.includes('expired')) {
        errorUrl.searchParams.set('error_type', 'expired');
        errorUrl.searchParams.set('action', 'resend');
      } else if (result.error?.includes('invalid')) {
        errorUrl.searchParams.set('error_type', 'invalid');
        errorUrl.searchParams.set('action', 'retry');
      } else {
        errorUrl.searchParams.set('error_type', 'generic');
        errorUrl.searchParams.set('action', 'contact');
      }

      return NextResponse.redirect(errorUrl);
    }

  } catch (error) {
    console.error('Email verification handler error:', error);

    const errorMessage = error instanceof Error ? error.message : 'Verification processing failed';
    const errorUrl = new URL('/auth/error', request.url);
    errorUrl.searchParams.set('error', errorMessage);
    errorUrl.searchParams.set('error_type', 'system');
    errorUrl.searchParams.set('action', 'retry');

    return NextResponse.redirect(errorUrl);
  }
}
