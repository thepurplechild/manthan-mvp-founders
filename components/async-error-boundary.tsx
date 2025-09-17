'use client'

import React from 'react'
import { ErrorBoundary } from './error-boundary'
import { Button } from './ui/button'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'

interface AsyncErrorBoundaryProps {
  children: React.ReactNode
  onError?: (error: Error, errorInfo?: React.ErrorInfo) => void
}

interface AsyncErrorFallbackProps {
  error: Error
  resetError: () => void
}

function AsyncErrorFallback({ error, resetError }: AsyncErrorFallbackProps) {
  const isAuthError = error.message.includes('Auth') || error.message.includes('auth')
  const isNetworkError = error.message.includes('fetch') || error.message.includes('network')
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-6">
      <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20 max-w-lg w-full">
        <div className="text-center mb-6">
          <div className="bg-red-500/20 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8 text-red-400" />
          </div>
          
          <h2 className="text-2xl font-bold text-white mb-2">
            {isAuthError ? 'Authentication Error' : 
             isNetworkError ? 'Connection Error' : 
             'Application Error'}
          </h2>
          
          <p className="text-purple-200">
            {isAuthError ? 
              'There was a problem with your authentication. Please sign in again.' :
             isNetworkError ? 
              'Unable to connect to our servers. Please check your internet connection.' :
              'An unexpected error occurred while loading the application.'}
          </p>
        </div>
        
        {process.env.NODE_ENV === 'development' && (
          <div className="bg-red-900/20 border border-red-500/20 rounded-lg p-4 mb-6">
            <p className="text-red-300 text-sm font-mono break-words">
              {error.name}: {error.message}
            </p>
            {error.stack && (
              <details className="mt-2">
                <summary className="text-red-400 text-xs cursor-pointer">Stack trace</summary>
                <pre className="text-red-300 text-xs mt-1 overflow-auto max-h-32">
                  {error.stack}
                </pre>
              </details>
            )}
          </div>
        )}
        
        <div className="flex gap-3">
          <Button
            onClick={resetError}
            className="flex-1 bg-purple-600 hover:bg-purple-700 text-white"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Retry
          </Button>
          
          {isAuthError ? (
            <Button
              onClick={() => window.location.href = '/auth/login'}
              variant="outline"
              className="flex-1 border-white/20 text-white hover:bg-white/10"
            >
              Sign In
            </Button>
          ) : (
            <Button
              onClick={() => window.location.href = '/'}
              variant="outline"
              className="flex-1 border-white/20 text-white hover:bg-white/10"
            >
              <Home className="w-4 h-4 mr-2" />
              Home
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function AsyncErrorBoundary({ children, onError }: AsyncErrorBoundaryProps) {
  React.useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error('Unhandled promise rejection:', event.reason)
      onError?.(event.reason instanceof Error ? event.reason : new Error(String(event.reason)))
      // Prevent the default browser behavior
      event.preventDefault()
    }

    const handleError = (event: ErrorEvent) => {
      console.error('Global error:', event.error)
      onError?.(event.error instanceof Error ? event.error : new Error(String(event.error)))
    }

    window.addEventListener('unhandledrejection', handleUnhandledRejection)
    window.addEventListener('error', handleError)

    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)
      window.removeEventListener('error', handleError)
    }
  }, [onError])

  return (
    <ErrorBoundary fallback={AsyncErrorFallback}>
      {children}
    </ErrorBoundary>
  )
}