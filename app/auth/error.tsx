'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { RefreshCw, Home, AlertTriangle, LogIn } from 'lucide-react'

/**
 * Authentication Route Error Handler
 * Handles errors specific to authentication flows
 * Provides contextual recovery options for auth-related issues
 */
export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const searchParams = useSearchParams()
  const errorCode = searchParams.get('error')
  const errorDescription = searchParams.get('error_description')

  useEffect(() => {
    console.error('Auth error:', { error, errorCode, errorDescription })
  }, [error, errorCode, errorDescription])

  // Map common auth error codes to user-friendly messages
  const getErrorMessage = () => {
    switch (errorCode) {
      case 'access_denied':
        return 'Access was denied. Please try signing in again.'
      case 'server_error':
        return 'Authentication server error. Please try again in a moment.'
      case 'temporarily_unavailable':
        return 'Authentication service is temporarily unavailable.'
      case 'invalid_request':
        return 'Invalid authentication request. Please try again.'
      case 'email_not_confirmed':
        return 'Please check your email and click the confirmation link before signing in.'
      default:
        return errorDescription || error.message || 'An authentication error occurred.'
    }
  }

  const isEmailConfirmationIssue = errorCode === 'email_not_confirmed' ||
    error.message.includes('email_not_confirmed') ||
    error.message.includes('Email not confirmed')

  return (
    <div className="min-h-screen gradient-indian-bg flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center">
        {/* Error Icon */}
        <div className="flex justify-center mb-6">
          <div className="w-24 h-24 bg-manthan-coral-100 rounded-full flex items-center justify-center shadow-indian">
            <AlertTriangle className="w-12 h-12 text-manthan-coral-600" />
          </div>
        </div>

        {/* Error Content */}
        <div className="card-indian p-8 space-y-6">
          <div>
            <h1 className="text-2xl font-heading font-bold text-manthan-charcoal-800 mb-3">
              Authentication Error
            </h1>
            <p className="text-manthan-charcoal-600 text-base leading-relaxed">
              {getErrorMessage()}
            </p>
          </div>

          {/* Email Confirmation Helper */}
          {isEmailConfirmationIssue && (
            <div className="bg-manthan-royal-50 border border-manthan-royal-200 rounded-lg p-4">
              <h3 className="font-semibold text-manthan-royal-800 mb-2">
                Email Confirmation Required
              </h3>
              <ul className="text-sm text-manthan-royal-700 text-left space-y-1">
                <li>• Check your email inbox (including spam folder)</li>
                <li>• Click the confirmation link in the email</li>
                <li>• Return here and try signing in again</li>
              </ul>
            </div>
          )}

          {/* Development Debug Info */}
          {process.env.NODE_ENV === 'development' && (
            <div className="bg-manthan-charcoal-50 border border-manthan-charcoal-200 rounded-lg p-4 text-left">
              <h3 className="font-semibold text-manthan-charcoal-800 mb-2">Debug Info:</h3>
              <div className="text-sm text-manthan-charcoal-600 space-y-1">
                <p><strong>Error Code:</strong> {errorCode || 'None'}</p>
                <p><strong>Description:</strong> {errorDescription || 'None'}</p>
                <p><strong>Message:</strong> {error.message}</p>
                {error.digest && <p><strong>Digest:</strong> {error.digest}</p>}
              </div>
            </div>
          )}

          {/* Recovery Actions */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={reset}
                className="btn-indian flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Try Again
              </button>
              <Link
                href="/auth/login"
                className="btn-outline-indian flex items-center justify-center gap-2"
              >
                <LogIn className="w-4 h-4" />
                Back to Login
              </Link>
            </div>

            {/* Additional Actions */}
            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                href="/auth/sign-up"
                className="text-sm text-manthan-charcoal-600 hover:text-manthan-saffron-600 underline"
              >
                Create New Account
              </Link>
              <Link
                href="/auth/forgot-password"
                className="text-sm text-manthan-charcoal-600 hover:text-manthan-saffron-600 underline"
              >
                Reset Password
              </Link>
              <Link
                href="/"
                className="text-sm text-manthan-charcoal-600 hover:text-manthan-saffron-600 underline"
              >
                Go to Home
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}