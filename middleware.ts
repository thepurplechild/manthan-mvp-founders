import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getSupabaseClient } from './lib/auth/supabase-edge';

// Requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables.
const NON_FOUNDER_REDIRECT_PATH = '/403'; // Update if a dedicated /403 page is not available.

export async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  // Safety guard: the matcher already targets founder routes; this prevents accidental execution elsewhere.
  if (!pathname.startsWith('/founder')) {
    return NextResponse.next();
  }

  const origin = req.nextUrl.origin;
  const redirectTarget = `${pathname}${req.nextUrl.search}`;
  const loginUrl = new URL('/login', origin);
  loginUrl.searchParams.set('redirect', redirectTarget);

  const forbiddenUrl = new URL(NON_FOUNDER_REDIRECT_PATH, origin);

  const response = NextResponse.next();

  let supabase: ReturnType<typeof getSupabaseClient>;
  try {
    supabase = getSupabaseClient(req, response);
  } catch (error) {
    console.error('[middleware] Supabase configuration error', error);
    return NextResponse.redirect(loginUrl);
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

  if (sessionError) {
    console.error('[middleware] Failed to fetch Supabase session', sessionError.message);
  }

  const user = sessionData?.session?.user;
  if (!user) {
    return NextResponse.redirect(loginUrl);
  }

  try {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.error('[middleware] Unable to load profile role', profileError.message);
      return NextResponse.redirect(forbiddenUrl);
    }

    if (!profile || profile.role !== 'founder') {
      return NextResponse.redirect(forbiddenUrl);
    }
  } catch (error) {
    console.error('[middleware] Exception while validating founder access', error);
    return NextResponse.redirect(forbiddenUrl);
  }

  return response;
}

export const config = {
  /**
   * Update matcher paths if the `(founder)` route group maps to different public URLs,
   * e.g. ['/dashboard/:path*', '/projects/:path*'].
   */
  matcher: ['/founder/:path*'],
};
