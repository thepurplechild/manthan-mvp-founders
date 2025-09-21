import Link from 'next/link'
import { ArrowLeft, Home, Search, AlertTriangle } from 'lucide-react'

/**
 * Global 404 Not Found Page
 * Provides user-friendly error handling for missing routes with debugging info for development
 */
export default function NotFound() {
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
            <h1 className="text-3xl font-heading font-bold text-manthan-charcoal-800 mb-3">
              Page Not Found
            </h1>
            <p className="text-manthan-charcoal-600 text-lg">
              The page you're looking for doesn't exist or may have been moved.
            </p>
          </div>

          {/* Development Debug Info */}
          {process.env.NODE_ENV === 'development' && (
            <div className="bg-manthan-charcoal-50 border border-manthan-charcoal-200 rounded-lg p-4 text-left">
              <h3 className="font-semibold text-manthan-charcoal-800 mb-2">Debug Info:</h3>
              <ul className="text-sm text-manthan-charcoal-600 space-y-1">
                <li>• Check if the route exists in app/ directory</li>
                <li>• Verify middleware.ts configuration</li>
                <li>• Check vercel.json rewrites/redirects</li>
                <li>• Ensure page.tsx files are properly exported</li>
              </ul>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href="/dashboard"
              className="btn-indian flex items-center justify-center gap-2"
            >
              <Home className="w-4 h-4" />
              Go to Dashboard
            </Link>
            <Link
              href="/auth/login"
              className="btn-outline-indian flex items-center justify-center gap-2"
            >
              <Search className="w-4 h-4" />
              Sign In
            </Link>
          </div>

          {/* Back Link */}
          <div className="pt-4 border-t border-manthan-saffron-200/50">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-manthan-charcoal-600 hover:text-manthan-saffron-600 transition-colors group"
            >
              <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
              <span>Back to Home</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}