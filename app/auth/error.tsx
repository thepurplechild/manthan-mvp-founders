'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { RefreshCw, Home, AlertTriangle, LogIn, Mail, Clock, Shield, ExternalLink } from 'lucide-react'

/**
 * 🚨 Enhanced Authentication Error Handler
 *
 * Provides comprehensive error handling for authentication flows
 * with contextual recovery options, detailed debugging information,
 * and user-friendly guidance.
 */

interface ErrorContext {
  errorCode?: string;
  errorType?: string;
  action?: string;
  description?: string;
  timestamp: string;
}

interface RecoveryAction {
  label: string;
  description: string;
  href?: string;
  onClick?: () => void;
  icon: React.ComponentType<{ className?: string }>;
  primary?: boolean;
}

export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const searchParams = useSearchParams()
  const [context, setContext] = useState<ErrorContext>({
    timestamp: new Date().toISOString()
  });
  const [retryCount, setRetryCount] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);

  useEffect(() => {
    const errorCode = searchParams?.get('error')
    const errorType = searchParams?.get('error_type')
    const action = searchParams?.get('action')
    const description = searchParams?.get('error_description')

    setContext({
      errorCode: errorCode || undefined,
      errorType: errorType || undefined,
      action: action || undefined,
      description: description || undefined,
      timestamp: new Date().toISOString()
    });

    // Log error for monitoring
    console.error('🚨 Authentication Error:', {
      error: error.message,
      errorCode,
      errorType,
      action,
      description,
      digest: error.digest,
      timestamp: new Date().toISOString()
    });
  }, [searchParams, error])

  /**
   * Get user-friendly error message and guidance
   */
  const getErrorInfo = (): {
    title: string;
    message: string;
    severity: 'error' | 'warning' | 'info';
    category: 'verification' | 'authentication' | 'system' | 'network';
  } => {
    const { errorCode, errorType } = context;

    // Handle verification-specific errors
    if (errorType === 'expired') {
      return {
        title: 'Verification Link Expired',
        message: 'Your email verification link has expired. This happens after 24 hours for security reasons. Please request a new verification email.',
        severity: 'warning',
        category: 'verification'
      };
    }

    if (errorType === 'invalid') {
      return {
        title: 'Invalid Verification Link',
        message: 'The verification link appears to be malformed or corrupted. Please check that you clicked the complete link from your email, or request a new one.',
        severity: 'error',
        category: 'verification'
      };
    }

    if (errorType === 'system') {
      return {
        title: 'System Error',
        message: 'We encountered a technical issue while processing your request. Our team has been notified and is working to resolve this.',
        severity: 'error',
        category: 'system'
      };
    }

    // Handle authentication errors
    switch (errorCode) {
      case 'access_denied':
        return {
          title: 'Access Denied',
          message: 'Access was denied during authentication. This may happen if you cancelled the sign-in process or your session expired.',
          severity: 'warning',
          category: 'authentication'
        };

      case 'email_not_confirmed':
        return {
          title: 'Email Not Confirmed',
          message: 'Please check your email and click the confirmation link before signing in. Don\'t forget to check your spam folder!',
          severity: 'warning',
          category: 'verification'
        };

      case 'invalid_credentials':
        return {
          title: 'Invalid Credentials',
          message: 'The email or password you entered is incorrect. If you just signed up, make sure you\'ve confirmed your email first.',
          severity: 'error',
          category: 'authentication'
        };

      case 'server_error':
        return {
          title: 'Server Error',
          message: 'Our authentication server is experiencing issues. Please try again in a few moments.',
          severity: 'error',
          category: 'system'
        };

      case 'temporarily_unavailable':
        return {
          title: 'Service Temporarily Unavailable',
          message: 'The authentication service is temporarily unavailable for maintenance. Please try again in a few minutes.',
          severity: 'warning',
          category: 'system'
        };

      default:
        return {
          title: 'Authentication Error',
          message: context.description || error.message || 'An unexpected error occurred during authentication.',
          severity: 'error',
          category: 'authentication'
        };
    }
  };

  /**
   * Get contextual recovery actions
   */
  const getRecoveryActions = (): RecoveryAction[] => {
    const { errorType, action } = context;
    const actions: RecoveryAction[] = [];

    // Primary action based on error type
    if (action === 'resend' || errorType === 'expired') {
      actions.push({
        label: 'Resend Verification Email',
        description: 'Get a new verification link sent to your email',
        href: '/auth/login?resend=true',
        icon: Mail,
        primary: true
      });
    }

    if (action === 'retry' || errorType === 'invalid') {
      actions.push({
        label: 'Try Again',
        description: 'Retry the authentication process',
        onClick: handleRetry,
        icon: RefreshCw,
        primary: true
      });
    }

    // Always provide these fallback options
    actions.push({
      label: 'Back to Login',
      description: 'Return to the login page',
      href: '/auth/login',
      icon: LogIn
    });

    actions.push({
      label: 'Create New Account',
      description: 'Sign up for a new account',
      href: '/auth/sign-up',
      icon: Shield
    });

    actions.push({
      label: 'Go to Home',
      description: 'Return to the main page',
      href: '/',
      icon: Home
    });

    return actions;
  };

  /**
   * Handle retry with exponential backoff
   */
  const handleRetry = async () => {
    if (isRetrying) return;

    setIsRetrying(true);
    setRetryCount(prev => prev + 1);

    // Exponential backoff: 1s, 2s, 4s
    const delay = Math.min(1000 * Math.pow(2, retryCount), 4000);

    console.log(`🔄 Retrying authentication (attempt ${retryCount + 1}) after ${delay}ms delay`);

    setTimeout(() => {
      reset();
      setIsRetrying(false);
    }, delay);
  };

  const errorInfo = getErrorInfo();
  const recoveryActions = getRecoveryActions();

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'error': return 'text-red-600 bg-red-100';
      case 'warning': return 'text-yellow-600 bg-yellow-100';
      case 'info': return 'text-blue-600 bg-blue-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'error': return AlertTriangle;
      case 'warning': return Clock;
      case 'info': return Shield;
      default: return AlertTriangle;
    }
  };

  const SeverityIcon = getSeverityIcon(errorInfo.severity);

  return (
    <div className="min-h-screen gradient-indian-bg flex items-center justify-center p-6">
      <div className="max-w-lg w-full">
        {/* Error Icon */}
        <div className="flex justify-center mb-6">
          <div className={`w-24 h-24 rounded-full flex items-center justify-center shadow-indian ${getSeverityColor(errorInfo.severity)}`}>
            <SeverityIcon className="w-12 h-12" />
          </div>
        </div>

        {/* Error Content */}
        <div className="card-indian p-8 space-y-6">
          {/* Header */}
          <div className="text-center">
            <h1 className="text-2xl font-heading font-bold text-manthan-charcoal-800 mb-3">
              {errorInfo.title}
            </h1>
            <p className="text-manthan-charcoal-600 text-base leading-relaxed">
              {errorInfo.message}
            </p>
          </div>

          {/* Category-specific guidance */}
          {errorInfo.category === 'verification' && (
            <div className="bg-manthan-royal-50 border border-manthan-royal-200 rounded-lg p-4">
              <h3 className="font-semibold text-manthan-royal-800 mb-2 flex items-center gap-2">
                <Mail className="w-4 h-4" />
                Email Verification Tips
              </h3>
              <ul className="text-sm text-manthan-royal-700 space-y-1">
                <li>• Check your email inbox and spam/junk folder</li>
                <li>• Verification links expire after 24 hours</li>
                <li>• Make sure to click the complete link from the email</li>
                <li>• If the link is broken, request a new verification email</li>
              </ul>
            </div>
          )}

          {errorInfo.category === 'system' && (
            <div className="bg-manthan-saffron-50 border border-manthan-saffron-200 rounded-lg p-4">
              <h3 className="font-semibold text-manthan-saffron-800 mb-2 flex items-center gap-2">
                <Clock className="w-4 h-4" />
                What's Happening
              </h3>
              <p className="text-sm text-manthan-saffron-700">
                We're experiencing temporary technical difficulties. Our engineering team has been automatically notified and is working to resolve this issue. Please try again in a few minutes.
              </p>
            </div>
          )}

          {/* Retry Status */}
          {retryCount > 0 && (
            <div className="bg-manthan-charcoal-50 border border-manthan-charcoal-200 rounded-lg p-4">
              <div className="flex items-center gap-2 text-manthan-charcoal-700">
                <RefreshCw className={`w-4 h-4 ${isRetrying ? 'animate-spin' : ''}`} />
                <span className="text-sm">
                  {isRetrying ? 'Retrying...' : `Retry attempt ${retryCount}`}
                </span>
              </div>
            </div>
          )}

          {/* Recovery Actions */}
          <div className="space-y-3">
            <h3 className="font-semibold text-manthan-charcoal-800">What would you like to do?</h3>

            {recoveryActions.map((action, index) => (
              <div key={index}>
                {action.href ? (
                  <Link
                    href={action.href as any}
                    className={`w-full flex items-center gap-3 p-4 rounded-xl border transition-all duration-200 hover:shadow-md ${
                      action.primary
                        ? 'bg-manthan-saffron-500 hover:bg-manthan-saffron-600 text-white border-manthan-saffron-600'
                        : 'bg-white hover:bg-manthan-saffron-50 text-manthan-charcoal-700 border-manthan-charcoal-200 hover:border-manthan-saffron-300'
                    }`}
                  >
                    <action.icon className="w-5 h-5 flex-shrink-0" />
                    <div className="text-left">
                      <div className="font-medium">{action.label}</div>
                      <div className={`text-sm ${action.primary ? 'text-white/90' : 'text-manthan-charcoal-500'}`}>
                        {action.description}
                      </div>
                    </div>
                  </Link>
                ) : (
                  <button
                    onClick={action.onClick}
                    disabled={isRetrying}
                    className={`w-full flex items-center gap-3 p-4 rounded-xl border transition-all duration-200 hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed ${
                      action.primary
                        ? 'bg-manthan-saffron-500 hover:bg-manthan-saffron-600 text-white border-manthan-saffron-600'
                        : 'bg-white hover:bg-manthan-saffron-50 text-manthan-charcoal-700 border-manthan-charcoal-200 hover:border-manthan-saffron-300'
                    }`}
                  >
                    <action.icon className={`w-5 h-5 flex-shrink-0 ${isRetrying && action.label.includes('Try Again') ? 'animate-spin' : ''}`} />
                    <div className="text-left">
                      <div className="font-medium">{action.label}</div>
                      <div className={`text-sm ${action.primary ? 'text-white/90' : 'text-manthan-charcoal-500'}`}>
                        {action.description}
                      </div>
                    </div>
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Support Information */}
          <div className="border-t border-manthan-charcoal-200 pt-4">
            <h4 className="font-semibold text-manthan-charcoal-800 mb-2">Need Help?</h4>
            <p className="text-sm text-manthan-charcoal-600 mb-3">
              If you continue to experience issues, our support team is here to help.
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <Link
                href="/"
                className="inline-flex items-center gap-2 text-sm text-manthan-royal-600 hover:text-manthan-royal-700 font-medium"
              >
                <ExternalLink className="w-3 h-3" />
                Contact Support
              </Link>
              <Link
                href="/"
                className="inline-flex items-center gap-2 text-sm text-manthan-royal-600 hover:text-manthan-royal-700 font-medium"
              >
                <Shield className="w-3 h-3" />
                Authentication Help
              </Link>
            </div>
          </div>

          {/* Development Debug Info */}
          {process.env.NODE_ENV === 'development' && (
            <details className="bg-manthan-charcoal-50 border border-manthan-charcoal-200 rounded-lg p-4 text-left">
              <summary className="font-semibold text-manthan-charcoal-800 cursor-pointer mb-2">
                Debug Information (Development Only)
              </summary>
              <div className="text-sm text-manthan-charcoal-600 space-y-2 font-mono">
                <div><strong>Error Code:</strong> {context.errorCode || 'None'}</div>
                <div><strong>Error Type:</strong> {context.errorType || 'None'}</div>
                <div><strong>Suggested Action:</strong> {context.action || 'None'}</div>
                <div><strong>Description:</strong> {context.description || 'None'}</div>
                <div><strong>Message:</strong> {error.message}</div>
                <div><strong>Category:</strong> {errorInfo.category}</div>
                <div><strong>Severity:</strong> {errorInfo.severity}</div>
                <div><strong>Retry Count:</strong> {retryCount}</div>
                <div><strong>Timestamp:</strong> {context.timestamp}</div>
                {error.digest && <div><strong>Digest:</strong> {error.digest}</div>}
              </div>
            </details>
          )}
        </div>
      </div>
    </div>
  )
}