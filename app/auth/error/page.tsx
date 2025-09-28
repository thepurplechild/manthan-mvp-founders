import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, Home, Mail, ExternalLink } from "lucide-react";
import Link from "next/link";

interface ErrorPageProps {
  searchParams: Promise<{
    error?: string;
    description?: string;
    error_type?: string;
    action?: string;
  }>;
}

/**
 * Enhanced Authentication Error Page
 * Provides detailed error information and appropriate recovery actions
 */
export default async function AuthErrorPage({ searchParams }: ErrorPageProps) {
  const params = await searchParams;
  const { error, description, error_type, action } = params;

  // Categorize error types for better user experience
  const getErrorInfo = () => {
    if (error_type === 'expired') {
      return {
        title: "Verification Link Expired",
        message: "Your verification link has expired. This happens for security reasons.",
        icon: <AlertTriangle className="w-6 h-6 text-amber-500" />,
        actionText: "Request New Link",
        actionHref: "/auth/sign-up",
        showResend: true
      };
    }

    if (error_type === 'invalid') {
      return {
        title: "Invalid Verification Link",
        message: "The verification link appears to be invalid or malformed. Please check the link and try again.",
        icon: <AlertTriangle className="w-6 h-6 text-red-500" />,
        actionText: "Try Again",
        actionHref: "/auth/sign-in",
        showResend: true
      };
    }

    if (error_type === 'system') {
      return {
        title: "System Error",
        message: "A technical error occurred while processing your request. Our team has been notified.",
        icon: <AlertTriangle className="w-6 h-6 text-red-500" />,
        actionText: "Contact Support",
        actionHref: "mailto:support@manthan.com",
        showRetry: true
      };
    }

    // Default/generic error
    return {
      title: "Authentication Error",
      message: error || "An error occurred during authentication. Please try again.",
      icon: <AlertTriangle className="w-6 h-6 text-red-500" />,
      actionText: "Back to Sign In",
      actionHref: "/auth/sign-in",
      showRetry: true
    };
  };

  const errorInfo = getErrorInfo();

  return (
    <div className="min-h-screen gradient-indian-bg flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <Card className="card-indian">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 bg-manthan-coral-100 rounded-full flex items-center justify-center shadow-indian">
                {errorInfo.icon}
              </div>
            </div>
            <CardTitle className="text-2xl font-heading font-bold text-manthan-charcoal-800">
              {errorInfo.title}
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-6">
            <div className="text-center">
              <p className="text-manthan-charcoal-600 mb-4">
                {errorInfo.message}
              </p>

              {description && (
                <div className="bg-manthan-saffron-50 border border-manthan-saffron-200 rounded-lg p-3 mb-4">
                  <p className="text-sm text-manthan-charcoal-700">
                    <strong>Details:</strong> {description}
                  </p>
                </div>
              )}
            </div>

            {/* Primary Action */}
            <div className="space-y-3">
              {errorInfo.actionHref.startsWith('mailto:') ? (
                <a
                  href={errorInfo.actionHref}
                  className="btn-indian w-full flex items-center justify-center gap-2"
                >
                  <Mail className="w-4 h-4" />
                  {errorInfo.actionText}
                </a>
              ) : (
                <Link
                  href={errorInfo.actionHref as any}
                  className="btn-indian w-full flex items-center justify-center gap-2"
                >
                  {errorInfo.showResend && <RefreshCw className="w-4 h-4" />}
                  {errorInfo.actionText}
                </Link>
              )}

              {/* Secondary Actions */}
              <div className="flex gap-2">
                <Link
                  href={"/auth/sign-in" as any}
                  className="btn-outline-indian flex-1 flex items-center justify-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  Try Again
                </Link>
                <Link
                  href={"/" as any}
                  className="btn-outline-indian flex-1 flex items-center justify-center gap-2"
                >
                  <Home className="w-4 h-4" />
                  Home
                </Link>
              </div>
            </div>

            {/* Help Section */}
            <div className="pt-4 border-t border-manthan-saffron-200/50">
              <h4 className="font-semibold text-manthan-charcoal-800 mb-2">Need Help?</h4>
              <div className="space-y-2 text-sm text-manthan-charcoal-600">
                {errorInfo.showResend && (
                  <p>• Check your email spam folder for the verification link</p>
                )}
                <p>• Make sure you're clicking the link from the same device/browser</p>
                <p>• Try clearing your browser cache and cookies</p>
                <p>• Contact support if the problem persists</p>
              </div>
            </div>

            {/* Debug Info (Development) */}
            {process.env.NODE_ENV === 'development' && error && (
              <div className="pt-4 border-t border-manthan-coral-200/50">
                <details className="text-xs">
                  <summary className="cursor-pointer font-semibold text-manthan-charcoal-700 mb-2">
                    Debug Information (Development)
                  </summary>
                  <div className="bg-manthan-charcoal-50 p-3 rounded border font-mono">
                    <div>Error: {error}</div>
                    {description && <div>Description: {description}</div>}
                    {error_type && <div>Type: {error_type}</div>}
                    {action && <div>Suggested Action: {action}</div>}
                  </div>
                </details>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
