import { createClient } from "@/lib/supabase/server";
import { type EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { type NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code"); // PKCE/OTP exchange code (newer flow)
  const next = searchParams.get("next") ?? "/";

  const supabase = await createClient();

  // Handle the `code` param (exchange code for a session)
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Redirect to verification success page instead of directly to dashboard
      return NextResponse.redirect(new URL('/auth/verification-success', request.url));
    }
    redirect(`/auth/error?error=${encodeURIComponent(error?.message ?? 'Code exchange failed')}`);
  }

  // Fallback: handle legacy token_hash/type verification
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) return NextResponse.redirect(new URL('/auth/verification-success', request.url));
    redirect(`/auth/error?error=${encodeURIComponent(error?.message ?? 'OTP verification failed')}`);
  }

  // redirect the user to an error page with some instructions
  redirect(`/auth/error?error=No token or code provided`);
}
