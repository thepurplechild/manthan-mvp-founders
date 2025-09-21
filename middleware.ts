import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

const LOGIN_PATH = '/auth/login';
const NON_FOUNDER_REDIRECT = '/dashboard';
const RIGHTS_ACCEPTANCE_PATH = '/auth/accept-rights';

function isAsset(pathname: string): boolean {
  return (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/static') ||
    pathname.match(/\.(.*)$/) !== null
  );
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Skip middleware for assets and non-protected routes
  if (isAsset(pathname)) {
    return NextResponse.next();
  }

  // Only apply middleware to founder routes and other protected routes
  const isProtectedRoute = pathname.startsWith('/founder') ||
                          pathname.startsWith('/dashboard') ||
                          pathname.startsWith('/projects');

  if (!isProtectedRoute) {
    return NextResponse.next();
  }

  const redirectTarget = `${pathname}${req.nextUrl.search}`;
  const url = req.nextUrl.clone();

  const cookieStore = await cookies();
  const response = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    const loginUrl = new URL(LOGIN_PATH, req.url);
    loginUrl.searchParams.set('redirect', redirectTarget);
    return NextResponse.redirect(loginUrl);
  }

  // Skip rights acceptance check for the acceptance page itself
  if (pathname === RIGHTS_ACCEPTANCE_PATH) {
    return response;
  }

  // Check if user has accepted Creator's Bill of Rights
  const { data: rightsAcceptance, error: rightsError } = await supabase
    .from('creator_rights_acceptances')
    .select('id')
    .eq('user_id', session.user.id)
    .single();

  if (rightsError || !rightsAcceptance) {
    // No rights acceptance found or error occurred - redirect to acceptance page
    const acceptanceUrl = new URL(RIGHTS_ACCEPTANCE_PATH, req.url);
    acceptanceUrl.searchParams.set('redirect', redirectTarget);
    return NextResponse.redirect(acceptanceUrl);
  }

  // For founder routes, check role
  if (pathname.startsWith('/founder')) {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .maybeSingle();

    if (profileError || !profile) {
      return NextResponse.redirect(new URL(NON_FOUNDER_REDIRECT, req.url));
    }

    if (profile.role !== 'founder') {
      return NextResponse.redirect(new URL(NON_FOUNDER_REDIRECT, req.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    '/founder/:path*',
    '/dashboard/:path*',
    '/projects/:path*',
    '/auth/accept-rights',
    '/protected/:path*'
  ],
};
