import { Loader2, Sparkles } from 'lucide-react'

/**
 * Authentication Routes Loading Component
 * Provides consistent loading UI for all auth-related pages
 * Includes brand-appropriate styling and animations
 */
export default function AuthLoading() {
  return (
    <div className="min-h-screen gradient-indian-bg flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center">
        {/* Animated background elements */}
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-20 left-10 w-72 h-72 bg-manthan-saffron-400 rounded-full mix-blend-multiply filter blur-3xl animate-pulse"></div>
          <div className="absolute top-40 right-10 w-72 h-72 bg-manthan-gold-400 rounded-full mix-blend-multiply filter blur-3xl animate-pulse delay-1000"></div>
          <div className="absolute bottom-20 left-1/2 w-72 h-72 bg-manthan-coral-400 rounded-full mix-blend-multiply filter blur-3xl animate-pulse delay-500"></div>
        </div>

        {/* Loading Card */}
        <div className="relative z-10 card-indian p-8 space-y-6">
          {/* Logo */}
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 gradient-saffron rounded-3xl flex items-center justify-center shadow-indian animate-pulse">
              <span className="text-white font-bold text-2xl font-heading">म</span>
            </div>
          </div>

          {/* Loading Content */}
          <div className="space-y-4">
            <h2 className="text-2xl font-heading font-bold text-manthan-charcoal-800">
              Loading...
            </h2>
            <p className="text-manthan-charcoal-600">
              Preparing your creative workspace
            </p>
          </div>

          {/* Loading Spinner */}
          <div className="flex items-center justify-center gap-3">
            <Loader2 className="w-6 h-6 text-manthan-saffron-600 animate-spin" />
            <Sparkles className="w-5 h-5 text-manthan-gold-600 animate-pulse" />
          </div>

          {/* Progress Dots */}
          <div className="flex justify-center gap-2">
            <div className="w-2 h-2 bg-manthan-saffron-400 rounded-full animate-pulse"></div>
            <div className="w-2 h-2 bg-manthan-gold-400 rounded-full animate-pulse delay-150"></div>
            <div className="w-2 h-2 bg-manthan-coral-400 rounded-full animate-pulse delay-300"></div>
            <div className="w-2 h-2 bg-manthan-mint-400 rounded-full animate-pulse delay-450"></div>
          </div>
        </div>
      </div>
    </div>
  )
}