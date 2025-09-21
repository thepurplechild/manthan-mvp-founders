'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { RefreshCw, Home, AlertTriangle, Bug } from 'lucide-react'

/**
 * Global Error Boundary for the entire application
 * Catches and handles runtime errors during routing and rendering
 * Provides fallback UI with recovery options
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log error to your error reporting service
    console.error('Global error caught:', error)

    // In production, you might want to send this to a service like Sentry
    if (process.env.NODE_ENV === 'production') {
      // Example: Sentry.captureException(error)
    }
  }, [error])

  return (
    <html>
      <body className="bg-manthan-ivory-50 text-manthan-charcoal-800 font-sans">
        <div className="min-h-screen gradient-indian-bg flex items-center justify-center p-6">
          <div className="max-w-lg w-full text-center">
            {/* Error Icon */}
            <div className="flex justify-center mb-6">
              <div className="w-24 h-24 bg-manthan-coral-100 rounded-full flex items-center justify-center shadow-indian">
                <Bug className="w-12 h-12 text-manthan-coral-600" />
              </div>
            </div>

            {/* Error Content */}
            <div className="card-indian p-8 space-y-6">
              <div>
                <h1 className="text-3xl font-heading font-bold text-manthan-charcoal-800 mb-3">
                  Something went wrong
                </h1>
                <p className="text-manthan-charcoal-600 text-lg">
                  We encountered an unexpected error. This might be a temporary issue.
                </p>
              </div>

              {/* Development Debug Info */}
              {process.env.NODE_ENV === 'development' && (
                <div className="bg-manthan-charcoal-50 border border-manthan-charcoal-200 rounded-lg p-4 text-left">
                  <h3 className="font-semibold text-manthan-charcoal-800 mb-2 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    Error Details:
                  </h3>
                  <pre className="text-sm text-manthan-coral-700 overflow-auto max-h-32 bg-white p-2 rounded border">
                    {error.message}
                  </pre>
                  {error.digest && (
                    <p className="text-xs text-manthan-charcoal-500 mt-2">
                      Error ID: {error.digest}
                    </p>
                  )}
                </div>
              )}

              {/* Recovery Actions */}
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={reset}
                  className="btn-indian flex items-center justify-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  Try Again
                </button>
                <Link
                  href="/dashboard"
                  className="btn-outline-indian flex items-center justify-center gap-2"
                >
                  <Home className="w-4 h-4" />
                  Go to Dashboard
                </Link>
              </div>

              {/* Additional Help */}
              <div className="pt-4 border-t border-manthan-saffron-200/50 text-sm text-manthan-charcoal-600">
                <p>
                  If this problem persists, please{' '}
                  <Link
                    href="/contact"
                    className="text-manthan-saffron-600 hover:text-manthan-gold-600 font-medium"
                  >
                    contact support
                  </Link>
                  {error.digest && ` and include error ID: ${error.digest}`}
                </p>
              </div>
            </div>
          </div>
        </div>
      </body>
    </html>
  )
}