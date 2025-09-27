'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { RefreshCw, Home, AlertTriangle, Bug, Info } from 'lucide-react'

/**
 * App-level Error Boundary
 * Catches and handles errors in the app directory
 * Provides detailed diagnostics for production deployment issues
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Enhanced logging for deployment issues
    console.error('App Error Details:', {
      message: error.message,
      stack: error.stack,
      digest: error.digest,
      timestamp: new Date().toISOString(),
      userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : 'unknown',
      url: typeof window !== 'undefined' ? window.location.href : 'unknown',
    })

    // Log to external service in production
    if (process.env.NODE_ENV === 'production') {
      // Could integrate with Sentry, LogRocket, etc.
      try {
        fetch('/api/health/error-log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            error: error.message,
            stack: error.stack,
            digest: error.digest,
            timestamp: new Date().toISOString(),
          }),
        }).catch(() => {
          // Fail silently if logging endpoint is unavailable
        })
      } catch {
        // Fail silently
      }
    }
  }, [error])

  // Detect potential causes based on error message
  const isPotentiallyDatabaseIssue = error.message.includes('Supabase') ||
                                     error.message.includes('database') ||
                                     error.message.includes('relation') ||
                                     error.message.includes('column')

  const isPotentiallyEnvIssue = error.message.includes('environment') ||
                               error.message.includes('undefined') ||
                               error.message.includes('SUPABASE')

  const isPotentiallyMigrationIssue = error.message.includes('creator_rights_acceptances') ||
                                     error.message.includes('platform_mandates') ||
                                     error.message.includes('deal_pipeline')

  return (
    <div className="min-h-screen gradient-indian-bg flex items-center justify-center p-6">
      <div className="max-w-2xl w-full">
        {/* Error Icon */}
        <div className="flex justify-center mb-6">
          <div className="w-24 h-24 bg-manthan-coral-100 rounded-full flex items-center justify-center shadow-indian">
            <Bug className="w-12 h-12 text-manthan-coral-600" />
          </div>
        </div>

        {/* Error Content */}
        <div className="card-indian p-8 space-y-6">
          <div className="text-center">
            <h1 className="text-3xl font-heading font-bold text-manthan-charcoal-800 mb-3">
              Application Error
            </h1>
            <p className="text-manthan-charcoal-600 text-lg">
              The application encountered an error during startup or navigation.
            </p>
          </div>

          {/* Potential Cause Analysis */}
          {(isPotentiallyDatabaseIssue || isPotentiallyEnvIssue || isPotentiallyMigrationIssue) && (
            <div className="bg-manthan-saffron-50 border border-manthan-saffron-200 rounded-lg p-4">
              <h3 className="font-semibold text-manthan-charcoal-800 mb-3 flex items-center gap-2">
                <Info className="w-4 h-4 text-manthan-saffron-600" />
                Potential Issue Detected:
              </h3>

              {isPotentiallyMigrationIssue && (
                <div className="mb-3 p-3 bg-white rounded border-l-4 border-manthan-coral-500">
                  <p className="text-sm text-manthan-charcoal-700">
                    <strong>Database Migration Issue:</strong> Error relates to recently added tables
                    (creator_rights_acceptances, platform_mandates, deal_pipeline).
                    The database migration may not have completed successfully.
                  </p>
                </div>
              )}

              {isPotentiallyDatabaseIssue && (
                <div className="mb-3 p-3 bg-white rounded border-l-4 border-manthan-coral-500">
                  <p className="text-sm text-manthan-charcoal-700">
                    <strong>Database Connection Issue:</strong> Error suggests problems connecting to or querying the database.
                    Check Supabase service status and connection configuration.
                  </p>
                </div>
              )}

              {isPotentiallyEnvIssue && (
                <div className="mb-3 p-3 bg-white rounded border-l-4 border-manthan-coral-500">
                  <p className="text-sm text-manthan-charcoal-700">
                    <strong>Environment Variables Issue:</strong> Missing or incorrect environment variables.
                    Verify SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY are set correctly.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Error Details (Development) */}
          {process.env.NODE_ENV === 'development' && (
            <div className="bg-manthan-charcoal-50 border border-manthan-charcoal-200 rounded-lg p-4">
              <h3 className="font-semibold text-manthan-charcoal-800 mb-2 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Error Details (Development):
              </h3>
              <pre className="text-xs text-manthan-coral-700 overflow-auto max-h-48 bg-white p-3 rounded border font-mono">
                {error.stack || error.message}
              </pre>
              {error.digest && (
                <p className="text-xs text-manthan-charcoal-500 mt-2">
                  Error Digest: {error.digest}
                </p>
              )}
            </div>
          )}

          {/* Production Error Info */}
          {process.env.NODE_ENV === 'production' && (
            <div className="bg-manthan-charcoal-50 border border-manthan-charcoal-200 rounded-lg p-4">
              <h3 className="font-semibold text-manthan-charcoal-800 mb-2">
                Error Information:
              </h3>
              <p className="text-sm text-manthan-charcoal-700 mb-2">
                {error.message}
              </p>
              {error.digest && (
                <p className="text-xs text-manthan-charcoal-500">
                  Reference ID: {error.digest}
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
              href="/"
              className="btn-outline-indian flex items-center justify-center gap-2"
            >
              <Home className="w-4 h-4" />
              Go Home
            </Link>
          </div>

          {/* Additional Diagnostics */}
          <div className="pt-4 border-t border-manthan-saffron-200/50">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <h4 className="font-semibold text-manthan-charcoal-800 mb-1">Quick Diagnostics:</h4>
                <ul className="text-manthan-charcoal-600 space-y-1">
                  <li>• <a href="/api/health" className="text-manthan-saffron-600 hover:underline">System Health Check</a></li>
                  <li>• <a href="/api/health/ingestion-pipeline" className="text-manthan-saffron-600 hover:underline">Pipeline Status</a></li>
                  <li>• <a href="/api/debug/test-cron" className="text-manthan-saffron-600 hover:underline">Environment Test</a></li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold text-manthan-charcoal-800 mb-1">Support:</h4>
                <p className="text-manthan-charcoal-600">
                  If this error persists, contact support with the reference ID above.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}