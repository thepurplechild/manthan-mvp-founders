import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * 🔐 Standard Supabase Auth Callback Handler
 *
 * This is the standard callback route that Supabase Auth expects
 * for handling OAuth redirects and email link verifications.
 * It works alongside the existing /auth/confirm route.
 */

interface CallbackParams {
  code?: string
  error?: string
  error_description?: string
  token_hash?: string
  type?: string
  next?: string
  // Additional Supabase Auth parameters
  access_token?: string
  refresh_token?: string
  expires_in?: string
  token_type?: string
}

/**
 * Create authenticated Supabase client for callback processing
 * Enhanced to ensure proper session persistence across route handlers
 */
async function createCallbackClient(response?: NextResponse) {
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            // Set cookies in both the cookie store and response
            cookieStore.set(name, value, options)

            // Also set in response headers if available for immediate effect
            if (response) {
              response.cookies.set(name, value, options)
            }
          })
        },
      },
    }
  )

  return supabase
}

/**
 * Log callback attempt for debugging
 */
function logCallbackAttempt(
  params: CallbackParams,
  result: { success: boolean; error?: string; redirectTo: string }
) {
  const logData = {
    timestamp: new Date().toISOString(),
    hasCode: !!params.code,
    hasTokenHash: !!params.token_hash,
    hasError: !!params.error,
    type: params.type,
    next: params.next,
    success: result.success,
    error: result.error,
    redirectTo: result.redirectTo
  }

  console.log('📊 Auth callback attempt:', JSON.stringify(logData, null, 2))
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const origin = requestUrl.origin

  // Extract all possible callback parameters
  const params: CallbackParams = {
    code: requestUrl.searchParams.get('code') || undefined,
    error: requestUrl.searchParams.get('error') || undefined,
    error_description: requestUrl.searchParams.get('error_description') || undefined,
    token_hash: requestUrl.searchParams.get('token_hash') || undefined,
    type: requestUrl.searchParams.get('type') || undefined,
    next: requestUrl.searchParams.get('next') || '/dashboard',
    // Additional Supabase parameters
    access_token: requestUrl.searchParams.get('access_token') || undefined,
    refresh_token: requestUrl.searchParams.get('refresh_token') || undefined,
    expires_in: requestUrl.searchParams.get('expires_in') || undefined,
    token_type: requestUrl.searchParams.get('token_type') || undefined
  }

  // Also check URL hash for parameters (some auth flows use fragments)
  const hash = requestUrl.hash.substring(1) // Remove the '#'
  if (hash) {
    const hashParams = new URLSearchParams(hash)
    if (!params.access_token) params.access_token = hashParams.get('access_token') || undefined
    if (!params.refresh_token) params.refresh_token = hashParams.get('refresh_token') || undefined
    if (!params.token_hash) params.token_hash = hashParams.get('token_hash') || undefined
    if (!params.type) params.type = hashParams.get('type') || undefined
    if (!params.code) params.code = hashParams.get('code') || undefined
  }

  console.log('🚀 Auth callback received:', {
    url: requestUrl.pathname + requestUrl.search,
    hash: requestUrl.hash,
    origin,
    params: {
      hasCode: !!params.code,
      hasTokenHash: !!params.token_hash,
      hasAccessToken: !!params.access_token,
      hasRefreshToken: !!params.refresh_token,
      hasError: !!params.error,
      type: params.type,
      next: params.next
    }
  })

  // Handle explicit auth errors from Supabase
  if (params.error) {
    console.error('❌ Auth callback error from Supabase:', params.error, params.error_description)

    const result = {
      success: false,
      error: params.error_description || params.error,
      redirectTo: `/auth/error?error=${encodeURIComponent(params.error)}&description=${encodeURIComponent(params.error_description || '')}`
    }

    logCallbackAttempt(params, result)
    return NextResponse.redirect(`${origin}${result.redirectTo}`)
  }

  // Handle direct access token flow (email verification with tokens in URL)
  if (params.access_token && params.refresh_token) {
    console.log('🔄 Processing direct token authentication...')

    try {
      // Create redirect response first to pass to client for cookie setting
      let redirectTo = params.next || '/dashboard'
      const redirectResponse = NextResponse.redirect(`${origin}${redirectTo}`)

      const supabase = await createCallbackClient(redirectResponse)

      // Set the session using the tokens
      const { data, error } = await supabase.auth.setSession({
        access_token: params.access_token,
        refresh_token: params.refresh_token
      })

      if (error) {
        console.error('❌ Token session failed:', error)

        const result = {
          success: false,
          error: error.message,
          redirectTo: `/auth/error?error=${encodeURIComponent(error.message)}`
        }

        logCallbackAttempt(params, result)
        return NextResponse.redirect(`${origin}${result.redirectTo}`)
      }

      if (!data?.user) {
        console.error('❌ No user data returned from token session')

        const result = {
          success: false,
          error: 'No user data returned',
          redirectTo: '/auth/error?error=No+user+data+returned'
        }

        logCallbackAttempt(params, result)
        return NextResponse.redirect(`${origin}${result.redirectTo}`)
      }

      console.log('✅ Token authentication successful for user:', data.user.id)

      // Check if user has accepted Creator's Bill of Rights
      const { data: rightsData, error: rightsError } = await supabase
        .from('creator_rights_acceptances')
        .select('id')
        .eq('user_id', data.user.id)
        .single()

      const hasAcceptedRights = !rightsError && !!rightsData

      // Update redirect destination based on rights status
      if (!hasAcceptedRights) {
        redirectTo = '/auth/accept-rights?verified=true'
        // Create new redirect response with updated destination
        const finalResponse = NextResponse.redirect(`${origin}${redirectTo}`)
        // Copy cookies from the session-setting response
        redirectResponse.cookies.getAll().forEach(cookie => {
          finalResponse.cookies.set(cookie.name, cookie.value, cookie)
        })

        console.log('🎯 Redirecting authenticated user to rights acceptance:', redirectTo)

        const result = {
          success: true,
          redirectTo
        }

        logCallbackAttempt(params, result)
        return finalResponse
      }

      console.log('🎯 Redirecting authenticated user to dashboard:', redirectTo)

      const result = {
        success: true,
        redirectTo
      }

      logCallbackAttempt(params, result)
      return redirectResponse

    } catch (error) {
      console.error('💥 Unexpected error during token authentication:', error)

      const errorMessage = error instanceof Error ? error.message : 'Unexpected authentication error'
      const result = {
        success: false,
        error: errorMessage,
        redirectTo: `/auth/error?error=${encodeURIComponent(errorMessage)}`
      }

      logCallbackAttempt(params, result)
      return NextResponse.redirect(`${origin}${result.redirectTo}`)
    }
  }

  // Handle token_hash + type flow (legacy email verification)
  if (params.token_hash && params.type) {
    console.log('🔄 Redirecting to /auth/confirm for token verification...')

    // Redirect to the existing comprehensive verification handler
    const confirmUrl = new URL('/auth/confirm', origin)
    confirmUrl.searchParams.set('token_hash', params.token_hash)
    confirmUrl.searchParams.set('type', params.type)
    if (params.next) {
      confirmUrl.searchParams.set('next', params.next)
    }

    const result = {
      success: true,
      redirectTo: confirmUrl.pathname + confirmUrl.search
    }

    logCallbackAttempt(params, result)
    return NextResponse.redirect(confirmUrl.toString())
  }

  // Handle OAuth code exchange (PKCE flow)
  if (params.code) {
    console.log('🔄 Processing OAuth code exchange...')

    try {
      // Create redirect response first to pass to client for cookie setting
      let redirectTo = params.next || '/dashboard'
      const redirectResponse = NextResponse.redirect(`${origin}${redirectTo}`)

      const supabase = await createCallbackClient(redirectResponse)

      const { data, error } = await supabase.auth.exchangeCodeForSession(params.code)

      if (error) {
        console.error('❌ Code exchange failed:', error)

        const result = {
          success: false,
          error: error.message,
          redirectTo: `/auth/error?error=${encodeURIComponent(error.message)}`
        }

        logCallbackAttempt(params, result)
        return NextResponse.redirect(`${origin}${result.redirectTo}`)
      }

      if (!data?.user) {
        console.error('❌ No user data returned from code exchange')

        const result = {
          success: false,
          error: 'No user data returned',
          redirectTo: '/auth/error?error=No+user+data+returned'
        }

        logCallbackAttempt(params, result)
        return NextResponse.redirect(`${origin}${result.redirectTo}`)
      }

      console.log('✅ OAuth authentication successful for user:', data.user.id)

      // Check if user has accepted Creator's Bill of Rights
      const { data: rightsData, error: rightsError } = await supabase
        .from('creator_rights_acceptances')
        .select('id')
        .eq('user_id', data.user.id)
        .single()

      const hasAcceptedRights = !rightsError && !!rightsData

      // Update redirect destination based on rights status
      if (!hasAcceptedRights) {
        redirectTo = '/auth/accept-rights?verified=true'
        // Create new redirect response with updated destination
        const finalResponse = NextResponse.redirect(`${origin}${redirectTo}`)
        // Copy cookies from the session-setting response
        redirectResponse.cookies.getAll().forEach(cookie => {
          finalResponse.cookies.set(cookie.name, cookie.value, cookie)
        })

        console.log('🎯 Redirecting authenticated user to rights acceptance:', redirectTo)

        const result = {
          success: true,
          redirectTo
        }

        logCallbackAttempt(params, result)
        return finalResponse
      }

      console.log('🎯 Redirecting authenticated user to dashboard:', redirectTo)

      const result = {
        success: true,
        redirectTo
      }

      logCallbackAttempt(params, result)
      return redirectResponse

    } catch (error) {
      console.error('💥 Unexpected error during code exchange:', error)

      const errorMessage = error instanceof Error ? error.message : 'Unexpected authentication error'
      const result = {
        success: false,
        error: errorMessage,
        redirectTo: `/auth/error?error=${encodeURIComponent(errorMessage)}`
      }

      logCallbackAttempt(params, result)
      return NextResponse.redirect(`${origin}${result.redirectTo}`)
    }
  }

  // No valid callback parameters found
  console.warn('⚠️ Invalid callback request - no valid parameters found')
  console.warn('Available parameters:', Object.entries(params).filter(([_, v]) => v !== undefined))

  // Provide detailed error for debugging
  const availableParams = Object.entries(params)
    .filter(([_, value]) => value !== undefined)
    .map(([key, _]) => key)
    .join(', ')

  const debugInfo = availableParams.length > 0
    ? `Available parameters: ${availableParams}`
    : 'No parameters found in URL'

  const result = {
    success: false,
    error: `Invalid verification parameters: ${debugInfo}`,
    redirectTo: `/auth/error?error=${encodeURIComponent(`Invalid verification parameters: ${debugInfo}`)}&error_type=invalid&action=retry`
  }

  logCallbackAttempt(params, result)
  return NextResponse.redirect(`${origin}${result.redirectTo}`)
}