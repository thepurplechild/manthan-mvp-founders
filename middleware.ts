/**
 * Next.js Middleware for Project Manthan MVP
 *
 * This middleware handles ONLY session management and basic authentication checks.
 * It does NOT perform role-based authorization or complex business logic.
 *
 * What this middleware DOES:
 * ✅ Refreshes expired sessions automatically
 * ✅ Checks if user is authenticated
 * ✅ Redirects unauthenticated users from protected routes to /login
 * ✅ Redirects authenticated users away from login/signup pages to /dashboard
 *
 * What this middleware DOES NOT do:
 * ❌ Check user roles (creator vs founder) - handled in layouts/components
 * ❌ Query the database - would cause performance issues
 * ❌ Implement complex authorization logic - handled in page components
 * ❌ Make decisions based on project ownership - handled in route handlers
 *
 * This approach prevents redirect loops and follows Next.js best practices
 * for middleware authentication patterns.
 */

import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  // Create a response object that we can modify
  let response = NextResponse.next({
    request,
  })

  // Create Supabase client for middleware context
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: any) {
          // Set the cookie on the request for immediate use
          request.cookies.set({
            name,
            value,
            ...options,
          })
          // Set the cookie on the response for the browser
          response = NextResponse.next({
            request,
          })
          response.cookies.set({
            name,
            value,
            ...options,
          })
        },
        remove(name: string, options: any) {
          // Remove the cookie from the request
          request.cookies.set({
            name,
            value: '',
            ...options,
          })
          // Remove the cookie from the response
          response = NextResponse.next({
            request,
          })
          response.cookies.set({
            name,
            value: '',
            ...options,
          })
        },
      },
    }
  )

  // Refresh session if expired - this will automatically update the cookies
  const {
    data: { session },
  } = await supabase.auth.getSession()

  const { pathname } = request.nextUrl

  // Define protected routes that require authentication
  const protectedRoutes = ['/dashboard', '/projects', '/founder']
  const authRoutes = ['/login', '/signup', '/auth/login', '/auth/signup']

  // Check if the current path is a protected route
  const isProtectedRoute = protectedRoutes.some((route) =>
    pathname.startsWith(route)
  )

  // Check if the current path is an auth route
  const isAuthRoute = authRoutes.some((route) => pathname.startsWith(route))

  // Redirect unauthenticated users from protected routes to login
  if (isProtectedRoute && !session) {
    const loginUrl = new URL('/auth/login', request.url)
    // Add the current path as a redirect parameter
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Redirect authenticated users away from auth routes to dashboard
  if (isAuthRoute && session) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // For all other routes, continue with the response
  return response
}

// Configure which routes the middleware should run on
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - files with extensions (.svg, .png, etc.)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}