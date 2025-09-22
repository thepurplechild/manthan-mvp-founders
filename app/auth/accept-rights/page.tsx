"use client";

import { useState, useEffect, Suspense, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Shield, FileText, ArrowRight, AlertCircle, RefreshCw, CheckCircle, ExternalLink } from "lucide-react";

/**
 * 🔐 Enhanced Creator's Bill of Rights Acceptance Page
 *
 * Features comprehensive error handling, retry mechanisms,
 * progress tracking, real-time navigation debugging, and
 * robust session management to prevent navigation failures.
 */

interface RightsAcceptanceResponse {
  success: boolean;
  message?: string;
  error?: string;
  retryable?: boolean;
  acceptanceId?: string;
}

interface RetryState {
  count: number;
  maxRetries: number;
  canRetry: boolean;
  nextRetryDelay: number;
}

interface NavigationState {
  isNavigating: boolean;
  navigationAttempts: number;
  lastAttemptTime?: number;
  navigationError?: string;
}

interface DebugInfo {
  sessionRefreshed: boolean;
  rightsCheckPassed: boolean;
  middlewareBypass: boolean;
  navigationMethod: 'router' | 'window' | 'manual';
  timing: {
    acceptanceStart?: number;
    acceptanceComplete?: number;
    sessionRefreshStart?: number;
    sessionRefreshComplete?: number;
    navigationStart?: number;
    navigationComplete?: number;
  };
}

const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAYS = [1000, 2000, 4000]; // Progressive delay
const NAVIGATION_TIMEOUT = 10000; // 10 seconds
const SESSION_REFRESH_DELAY = 500; // Wait for session propagation

function AcceptRightsContent() {
  const [acceptedRights, setAcceptedRights] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [navigationState, setNavigationState] = useState<NavigationState>({
    isNavigating: false,
    navigationAttempts: 0
  });
  const [retryState, setRetryState] = useState<RetryState>({
    count: 0,
    maxRetries: MAX_RETRY_ATTEMPTS,
    canRetry: true,
    nextRetryDelay: RETRY_DELAYS[0]
  });
  const [debugInfo, setDebugInfo] = useState<DebugInfo>({
    sessionRefreshed: false,
    rightsCheckPassed: false,
    middlewareBypass: false,
    navigationMethod: 'router',
    timing: {}
  });

  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl = searchParams?.get('redirect') || '/dashboard';
  const isVerified = searchParams?.get('verified') === 'true';

  /**
   * Enhanced user loading with session validation
   */
  useEffect(() => {
    const loadUserWithValidation = async () => {
      try {
        const supabase = createClient();
        const { data: { user }, error } = await supabase.auth.getUser();

        if (error) {
          console.error('Failed to get user:', error);
          setError('Failed to load user information. Please refresh the page.');
          return;
        }

        setUser(user);

        if (!user) {
          console.warn('User not authenticated, redirecting to login');
          router.push('/auth/login?error=authentication_required' as any);
          return;
        }

        // Check if user already has rights acceptance
        const { data: existingRights, error: rightsError } = await supabase
          .from('creator_rights_acceptances')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();

        if (!rightsError && existingRights) {
          console.log('User already has rights acceptance, bypassing to dashboard');
          setDebugInfo(prev => ({ ...prev, rightsCheckPassed: true, middlewareBypass: true }));

          // Force navigation with window.location as fallback
          try {
            router.push(redirectUrl as any);

            // Fallback after 2 seconds
            setTimeout(() => {
              window.location.href = redirectUrl;
            }, 2000);
          } catch (navError) {
            console.error('Navigation failed, using window.location:', navError);
            window.location.href = redirectUrl;
          }
          return;
        }

        console.log('✅ User loaded for rights acceptance:', user.id);
      } catch (err) {
        console.error('Error loading user:', err);
        setError('Unable to load user information. Please try again.');
      }
    };

    loadUserWithValidation();
  }, [router, redirectUrl]);

  /**
   * Reset error and success states
   */
  const resetStates = useCallback(() => {
    setError(null);
    setSuccessMessage(null);
  }, []);

  /**
   * Calculate next retry delay with exponential backoff
   */
  const getNextRetryDelay = useCallback((attemptCount: number): number => {
    return RETRY_DELAYS[Math.min(attemptCount, RETRY_DELAYS.length - 1)];
  }, []);

  /**
   * Refresh user session and validate rights acceptance
   */
  const refreshSessionAndValidateRights = useCallback(async (): Promise<boolean> => {
    try {
      setDebugInfo(prev => ({
        ...prev,
        timing: { ...prev.timing, sessionRefreshStart: Date.now() }
      }));

      const supabase = createClient();

      // Force refresh the session
      const { data: { session }, error: sessionError } = await supabase.auth.refreshSession();

      if (sessionError) {
        console.error('Session refresh failed:', sessionError);
        return false;
      }

      console.log('🔄 Session refreshed successfully');

      // Add a small delay to ensure database propagation
      await new Promise(resolve => setTimeout(resolve, SESSION_REFRESH_DELAY));

      // Verify rights acceptance in database
      const { data: rightsData, error: rightsError } = await supabase
        .from('creator_rights_acceptances')
        .select('id, accepted_at')
        .eq('user_id', session?.user?.id)
        .order('accepted_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const hasRights = !rightsError && !!rightsData;

      setDebugInfo(prev => ({
        ...prev,
        sessionRefreshed: true,
        rightsCheckPassed: hasRights,
        timing: { ...prev.timing, sessionRefreshComplete: Date.now() }
      }));

      console.log('📊 Rights validation result:', { hasRights, rightsData, rightsError });

      return hasRights;
    } catch (error) {
      console.error('Session refresh and validation failed:', error);
      return false;
    }
  }, []);

  /**
   * Enhanced navigation with multiple fallback methods
   */
  const performNavigation = useCallback(async (targetUrl: string, method: 'router' | 'window' | 'manual' = 'router') => {
    setNavigationState(prev => ({
      ...prev,
      isNavigating: true,
      navigationAttempts: prev.navigationAttempts + 1
    }));

    setDebugInfo(prev => ({
      ...prev,
      navigationMethod: method,
      timing: { ...prev.timing, navigationStart: Date.now() }
    }));

    try {
      console.log(`🚀 Attempting navigation to ${targetUrl} using method: ${method}`);

      switch (method) {
        case 'router':
          // Try Next.js router first
          router.push(targetUrl as any);

          // Set a timeout to check if navigation succeeded
          setTimeout(() => {
            if (window.location.pathname === '/auth/accept-rights') {
              console.warn('Router navigation may have failed, trying window.location');
              performNavigation(targetUrl, 'window');
            }
          }, 2000);
          break;

        case 'window':
          // Use window.location as fallback
          window.location.href = targetUrl;
          break;

        case 'manual':
          // Manual redirect for extreme cases
          const link = document.createElement('a');
          link.href = targetUrl;
          link.click();
          break;
      }

      setDebugInfo(prev => ({
        ...prev,
        timing: { ...prev.timing, navigationComplete: Date.now() }
      }));

    } catch (navError) {
      console.error(`Navigation failed with method ${method}:`, navError);

      setNavigationState(prev => ({
        ...prev,
        navigationError: navError instanceof Error ? navError.message : 'Navigation failed'
      }));

      // Try next method
      if (method === 'router') {
        setTimeout(() => performNavigation(targetUrl, 'window'), 1000);
      } else if (method === 'window') {
        setTimeout(() => performNavigation(targetUrl, 'manual'), 1000);
      }
    }
  }, [router]);

  /**
   * Handle rights acceptance with comprehensive error handling and robust navigation
   */
  const handleAcceptRights = useCallback(async (isRetry: boolean = false) => {
    if (!acceptedRights || !user) {
      setError("You must accept the Creator's Bill of Rights to continue");
      return;
    }

    setIsLoading(true);
    resetStates();

    const currentRetryCount = isRetry ? retryState.count + 1 : 0;

    setDebugInfo(prev => ({
      ...prev,
      timing: { ...prev.timing, acceptanceStart: Date.now() }
    }));

    try {
      console.log(`🚀 Attempting rights acceptance (attempt ${currentRetryCount + 1}/${MAX_RETRY_ATTEMPTS + 1})`);

      const requestBody = {
        version: '1.0 - MVP Launch',
        retryAttempt: currentRetryCount
      };

      const response = await fetch('/api/rights/accept', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(requestBody),
      });

      let payload: RightsAcceptanceResponse;
      try {
        payload = await response.json();
      } catch (parseError) {
        throw new Error('Server returned invalid response format');
      }

      if (response.ok && payload.success) {
        console.log('✅ Rights acceptance successful:', payload.acceptanceId);

        setDebugInfo(prev => ({
          ...prev,
          timing: { ...prev.timing, acceptanceComplete: Date.now() }
        }));

        setSuccessMessage(payload.message || 'Rights acceptance recorded successfully!');

        // Update retry state to prevent further attempts
        setRetryState(prev => ({ ...prev, canRetry: false }));

        console.log('🔄 Refreshing session and validating rights acceptance...');

        // Critical: Refresh session and validate before navigation
        const hasValidRights = await refreshSessionAndValidateRights();

        if (hasValidRights) {
          console.log('✅ Rights validation confirmed, proceeding with navigation');

          // Add small delay for user feedback, then navigate
          setTimeout(() => {
            performNavigation(redirectUrl, 'router');
          }, 1000);

          // Backup navigation in case primary fails
          setTimeout(() => {
            if (window.location.pathname === '/auth/accept-rights') {
              console.warn('Primary navigation failed, using backup method');
              performNavigation(redirectUrl, 'window');
            }
          }, 5000);

        } else {
          console.warn('⚠️ Rights validation failed, showing manual navigation option');
          setError(`Rights recorded but validation failed. Click here to continue: ${redirectUrl}`);

          // Provide manual navigation option
          setTimeout(() => {
            if (confirm('Rights acceptance completed! Click OK to proceed to your dashboard.')) {
              performNavigation(redirectUrl, 'window');
            }
          }, 2000);
        }

        return;
      }

      // Handle API errors
      const errorMessage = payload.error || 'Unknown error occurred';
      console.error('❌ Rights acceptance failed:', errorMessage);

      // Update retry state
      const canRetryAgain = payload.retryable !== false && currentRetryCount < MAX_RETRY_ATTEMPTS;
      const nextDelay = getNextRetryDelay(currentRetryCount);

      setRetryState({
        count: currentRetryCount,
        maxRetries: MAX_RETRY_ATTEMPTS,
        canRetry: canRetryAgain,
        nextRetryDelay: nextDelay
      });

      if (canRetryAgain) {
        setError(`${errorMessage} (Attempt ${currentRetryCount + 1}/${MAX_RETRY_ATTEMPTS + 1})`);
      } else {
        setError(
          currentRetryCount >= MAX_RETRY_ATTEMPTS
            ? `Maximum retry attempts reached. ${errorMessage} Please refresh the page and try again.`
            : errorMessage
        );
      }

    } catch (networkError: unknown) {
      console.error("❌ Network/system error during rights acceptance:", networkError);

      const errorMsg = networkError instanceof Error ? networkError.message : "Network error occurred";
      const canRetryAgain = currentRetryCount < MAX_RETRY_ATTEMPTS;

      setRetryState({
        count: currentRetryCount,
        maxRetries: MAX_RETRY_ATTEMPTS,
        canRetry: canRetryAgain,
        nextRetryDelay: getNextRetryDelay(currentRetryCount)
      });

      if (canRetryAgain) {
        setError(`${errorMsg} (Attempt ${currentRetryCount + 1}/${MAX_RETRY_ATTEMPTS + 1})`);
      } else {
        setError(`${errorMsg} Please check your internet connection and refresh the page.`);
      }
    } finally {
      setIsLoading(false);
    }
  }, [acceptedRights, user, retryState.count, resetStates, getNextRetryDelay, refreshSessionAndValidateRights, performNavigation, redirectUrl]);

  /**
   * Handle retry with progressive delay
   */
  const handleRetry = useCallback(async () => {
    if (!retryState.canRetry || retryState.count >= retryState.maxRetries) {
      return;
    }

    console.log(`⏳ Retrying in ${retryState.nextRetryDelay}ms...`);

    // Show countdown in error message
    setError(`Retrying in ${Math.ceil(retryState.nextRetryDelay / 1000)} seconds...`);

    setTimeout(() => {
      handleAcceptRights(true);
    }, retryState.nextRetryDelay);
  }, [retryState, handleAcceptRights]);

  /**
   * Emergency navigation fallback
   */
  const handleEmergencyNavigation = useCallback(() => {
    const confirmed = confirm(
      `Having trouble redirecting? Click OK to manually navigate to your dashboard.\n\nTarget: ${redirectUrl}`
    );

    if (confirmed) {
      window.open(redirectUrl, '_self');
    }
  }, [redirectUrl]);

  const handleLogout = useCallback(async () => {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push('/' as any);
    } catch (err) {
      console.error('Logout error:', err);
      // Force navigation even if logout fails
      window.location.href = '/';
    }
  }, [router]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        {/* Main Card */}
        <div className="relative bg-white/5 backdrop-blur-2xl rounded-3xl border border-white/10 shadow-2xl p-8 md:p-10">
          <div className="absolute inset-0 bg-gradient-to-r from-purple-500/5 to-pink-500/5 rounded-3xl"></div>

          <div className="relative">
            {/* Header */}
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-purple-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Shield className="w-8 h-8 text-purple-300" />
              </div>
              <h1 className="text-3xl font-bold text-white mb-3">Creator Protection Required</h1>
              <p className="text-white/60 text-lg">
                Before accessing Manthan, please read and accept our Creator's Bill of Rights
              </p>
              {isVerified && (
                <div className="mt-4 flex items-center justify-center gap-2 text-green-400 text-sm">
                  <CheckCircle className="w-4 h-4" />
                  <span>Email successfully verified!</span>
                </div>
              )}
            </div>

            {/* Navigation Status Indicator */}
            {navigationState.isNavigating && (
              <div className="bg-blue-500/10 backdrop-blur-xl border border-blue-500/20 rounded-2xl p-4 mb-6">
                <div className="flex items-center gap-3 text-blue-300">
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  <div>
                    <p className="font-semibold">Redirecting to Dashboard</p>
                    <p className="text-sm text-blue-200">
                      Navigation attempt {navigationState.navigationAttempts} • Method: {debugInfo.navigationMethod}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Important Notice */}
            <div className="bg-yellow-500/10 backdrop-blur-xl border border-yellow-500/20 rounded-2xl p-6 mb-8">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-yellow-400 mt-0.5 flex-shrink-0" />
                <div>
                  <h3 className="text-yellow-400 font-semibold mb-2">Action Required</h3>
                  <p className="text-yellow-100/90 text-sm">
                    We've updated our Creator's Bill of Rights to better protect your intellectual property.
                    Your acceptance is required to continue using Manthan.
                  </p>
                </div>
              </div>
            </div>

            {/* Creator's Bill of Rights */}
            <div className="space-y-6 bg-white/5 backdrop-blur-xl rounded-2xl p-6 border border-white/10 mb-8">
              <div className="flex items-center gap-2 text-purple-300">
                <Shield className="w-5 h-5" />
                <h3 className="font-semibold">Creator Protection</h3>
              </div>

              <Dialog>
                <DialogTrigger asChild>
                  <Button
                    variant="outline"
                    type="button"
                    className="w-full bg-white/10 backdrop-blur-xl border-white/20 text-white hover:bg-white/20 hover:text-white rounded-xl h-12 transition-all duration-300"
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    Read Creator's Bill of Rights
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto bg-white/95 backdrop-blur-xl">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <Shield className="w-5 h-5 text-purple-600" />
                      Creator's Bill of Rights
                    </DialogTitle>
                    <DialogDescription>
                      Please read and understand how your intellectual property will be handled
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 text-sm">
                    <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
                      <h4 className="font-semibold mb-2 text-purple-900">Your Rights as a Creator:</h4>
                      <ul className="space-y-2 text-gray-800">
                        <li>• I understand my uploaded script will be used only for the purpose of generating my project's pitch materials.</li>
                        <li>• I understand my script and personal data will never be shared with third parties without my explicit, case-by-case permission.</li>
                        <li>• I understand my intellectual property will not be used to train any public or third-party AI models.</li>
                        <li>• I retain full ownership of my creative work and all intellectual property rights.</li>
                        <li>• I can request deletion of my data and scripts at any time.</li>
                      </ul>
                    </div>
                    <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                      <h4 className="font-semibold mb-2 text-blue-900">Data Security & Privacy:</h4>
                      <ul className="space-y-2 text-gray-800">
                        <li>• Your scripts are encrypted both in transit and at rest</li>
                        <li>• Access to your content is restricted to authorized Manthan systems only</li>
                        <li>• We implement industry-standard security measures to protect your work</li>
                        <li>• You maintain the right to export or delete your content at any time</li>
                      </ul>
                    </div>
                    <p className="text-gray-800">
                      Manthan is committed to protecting creator rights and building a platform based on trust and transparency.
                      By accepting these terms, you acknowledge that you understand how your intellectual property will be protected.
                    </p>
                  </div>
                </DialogContent>
              </Dialog>

              <div className="flex items-start space-x-3">
                <Checkbox
                  id="rights-agreement"
                  checked={acceptedRights}
                  onCheckedChange={(checked) => setAcceptedRights(checked as boolean)}
                  className="mt-1 border-white/30 data-[state=checked]:bg-purple-500 data-[state=checked]:border-purple-500"
                  disabled={isLoading || navigationState.isNavigating}
                />
                <label htmlFor="rights-agreement" className="text-sm leading-relaxed text-white cursor-pointer">
                  I have read and agree to the Creator's Bill of Rights. I understand that my intellectual property will be protected and used only for generating my pitch materials.
                </label>
              </div>
            </div>

            {/* Success Message */}
            {successMessage && (
              <div className="bg-green-500/10 backdrop-blur-xl border border-green-500/20 text-green-300 p-4 rounded-xl text-sm mb-6 flex items-center gap-3">
                <CheckCircle className="w-5 h-5 flex-shrink-0" />
                <div>
                  <p className="font-semibold">Success!</p>
                  <p>{successMessage}</p>
                  <p className="text-green-200 text-xs mt-1">
                    {navigationState.isNavigating ? 'Redirecting to your dashboard...' : 'Processing navigation...'}
                  </p>
                </div>
              </div>
            )}

            {/* Error Message with Retry Option */}
            {error && (
              <div className="bg-red-500/10 backdrop-blur-xl border border-red-500/20 text-red-300 p-4 rounded-xl text-sm mb-6">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p>{error}</p>
                    {retryState.canRetry && retryState.count < retryState.maxRetries && !isLoading && (
                      <div className="mt-3">
                        <button
                          onClick={handleRetry}
                          className="inline-flex items-center gap-2 text-red-200 hover:text-red-100 text-xs underline"
                        >
                          <RefreshCw className="w-3 h-3" />
                          Retry ({retryState.count + 1}/{retryState.maxRetries + 1})
                        </button>
                      </div>
                    )}
                    {navigationState.navigationError && (
                      <div className="mt-3">
                        <button
                          onClick={handleEmergencyNavigation}
                          className="inline-flex items-center gap-2 text-red-200 hover:text-red-100 text-xs underline"
                        >
                          <ExternalLink className="w-3 h-3" />
                          Manual Navigation
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => handleAcceptRights(false)}
                disabled={isLoading || !acceptedRights || !!successMessage || navigationState.isNavigating}
                className="w-full h-12 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-semibold rounded-xl shadow-lg shadow-purple-500/25 backdrop-blur-sm border border-white/20 transition-all duration-300 hover:scale-105 hover:shadow-xl hover:shadow-purple-500/40 disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isLoading || navigationState.isNavigating ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    {navigationState.isNavigating ? 'Redirecting...' :
                     retryState.count > 0 ? `Retrying (${retryState.count + 1}/${retryState.maxRetries + 1})...` :
                     'Recording acceptance...'}
                  </div>
                ) : successMessage ? (
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" />
                    <span>Completed Successfully</span>
                  </div>
                ) : (
                  <>
                    Accept and Continue
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleLogout}
                disabled={isLoading || navigationState.isNavigating}
                className="w-full h-12 bg-white/10 backdrop-blur-xl border border-white/20 text-white hover:bg-white/20 rounded-xl transition-all duration-300 disabled:opacity-50"
              >
                Sign Out Instead
              </button>
            </div>

            {/* Footer */}
            <div className="text-center mt-8">
              <p className="text-white/40 text-sm">
                This acceptance is required to ensure your creative work is properly protected on our platform.
              </p>
              {retryState.count > 0 && (
                <p className="text-white/30 text-xs mt-2">
                  If you continue to experience issues, please contact support.
                </p>
              )}
            </div>

            {/* Development Debug Info */}
            {process.env.NODE_ENV === 'development' && (
              <details className="mt-8 bg-gray-900/50 border border-gray-600 rounded-lg p-4 text-left">
                <summary className="font-semibold text-gray-300 cursor-pointer mb-2">
                  🔧 Navigation Debug Info (Development Only)
                </summary>
                <div className="text-sm text-gray-400 space-y-2 font-mono">
                  <div><strong>Session Refreshed:</strong> {debugInfo.sessionRefreshed ? '✅' : '❌'}</div>
                  <div><strong>Rights Check Passed:</strong> {debugInfo.rightsCheckPassed ? '✅' : '❌'}</div>
                  <div><strong>Navigation Method:</strong> {debugInfo.navigationMethod}</div>
                  <div><strong>Navigation Attempts:</strong> {navigationState.navigationAttempts}</div>
                  <div><strong>Is Navigating:</strong> {navigationState.isNavigating ? '✅' : '❌'}</div>
                  <div><strong>Redirect URL:</strong> {redirectUrl}</div>
                  <div><strong>Current Path:</strong> {typeof window !== 'undefined' ? window.location.pathname : 'N/A'}</div>
                  {Object.entries(debugInfo.timing).map(([key, value]) => (
                    <div key={key}><strong>{key}:</strong> {value ? new Date(value).toLocaleTimeString() : 'N/A'}</div>
                  ))}
                </div>
              </details>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AcceptRightsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-white flex items-center gap-3">
          <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
          Loading Creator Protection...
        </div>
      </div>
    }>
      <AcceptRightsContent />
    </Suspense>
  );
}