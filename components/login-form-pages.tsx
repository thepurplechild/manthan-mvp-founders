/**
 * Pages Router Compatible Login Form
 * Uses client-side verification functions that call API routes
 * No server/client boundary violations
 */

"use client";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";
import { ArrowLeft, Mail, Lock, Sparkles, Star, AlertCircle, RefreshCw } from "lucide-react";

// Import ONLY client-side functions - no server dependencies
import {
  signInWithVerification,
  resendVerificationEmail,
  type SignInResult
} from "@/lib/auth/client-verification";

export interface LoginFormProps extends React.ComponentPropsWithoutRef<"div"> {
  onSignInSuccess?: (result: SignInResult) => void;
  redirectTo?: string;
}

export function LoginForm({
  className,
  onSignInSuccess,
  redirectTo,
  ...props
}: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<React.ReactNode | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendMsg, setResendMsg] = useState<string | null>(null);
  const router = useRouter();

  /**
   * Handle login form submission with comprehensive error handling
   */
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    setIsLoading(true);
    setError(null);
    setResendMsg(null);

    try {
      // Use client-side verification function that calls API routes
      const result = await signInWithVerification(email, password);

      if (result.success && result.user) {
        console.log('Sign in successful:', {
          userId: result.user.id,
          verificationState: result.verificationStatus.state,
          redirectTo: result.redirectTo
        });

        // Call success callback if provided
        if (onSignInSuccess) {
          onSignInSuccess(result);
        }

        // Redirect based on verification status or provided redirectTo
        const finalRedirectTo = redirectTo || result.redirectTo;
        router.push(finalRedirectTo);
      } else {
        // Handle specific verification-related errors
        const status = result.verificationStatus;

        switch (status.state) {
          case 'pending_verification':
            setError(
              <div>
                <div className="flex items-center gap-2 font-semibold mb-2">
                  <Mail className="w-4 h-4" />
                  Email Verification Required
                </div>
                <div className="text-sm space-y-2">
                  <p>Please check your email and click the confirmation link before signing in.</p>
                  <p className="text-manthan-charcoal-500">Check your spam folder if you don't see the email.</p>
                </div>
              </div>
            );
            break;

          case 'verification_failed':
            setError(
              <div>
                <div className="flex items-center gap-2 font-semibold mb-2">
                  <AlertCircle className="w-4 h-4" />
                  Verification Failed
                </div>
                <div className="text-sm">
                  {result.error || 'Unable to verify your account. Please try again.'}
                </div>
              </div>
            );
            break;

          default:
            if (result.rateLimited) {
              setError(
                <div>
                  <div className="flex items-center gap-2 font-semibold mb-2">
                    <AlertCircle className="w-4 h-4" />
                    Too Many Attempts
                  </div>
                  <div className="text-sm">
                    <p>{result.error}</p>
                    {result.remainingAttempts !== undefined && (
                      <p className="mt-1 text-manthan-charcoal-500">
                        Attempts remaining: {result.remainingAttempts}
                      </p>
                    )}
                  </div>
                </div>
              );
            } else if (result.error?.includes("Invalid login credentials")) {
              setError(
                <div>
                  <div className="flex items-center gap-2 font-semibold mb-2">
                    <Lock className="w-4 h-4" />
                    Invalid Credentials
                  </div>
                  <div className="text-sm space-y-1">
                    <p>Invalid email or password.</p>
                    <p className="text-manthan-charcoal-500">
                      If you just signed up, make sure you've confirmed your email first.
                    </p>
                  </div>
                </div>
              );
            } else {
              setError(
                <div>
                  <div className="flex items-center gap-2 font-semibold mb-2">
                    <AlertCircle className="w-4 h-4" />
                    Sign In Error
                  </div>
                  <div className="text-sm">
                    {result.error || 'An unexpected error occurred. Please try again.'}
                  </div>
                </div>
              );
            }
        }
      }
    } catch (error: unknown) {
      console.error("Sign in error:", error);
      const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";

      setError(
        <div>
          <div className="flex items-center gap-2 font-semibold mb-2">
            <AlertCircle className="w-4 h-4" />
            Connection Error
          </div>
          <div className="text-sm">
            {errorMessage}. Please check your internet connection and try again.
          </div>
        </div>
      );
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Handle resend verification email with rate limiting
   */
  const handleResend = async () => {
    setResendMsg(null);
    if (!email) {
      setResendMsg('Enter your email above first.');
      return;
    }

    setResending(true);

    try {
      // Use client-side function that calls API route
      const result = await resendVerificationEmail(email);

      if (result.success) {
        setResendMsg(result.message);
        // Clear any existing error since we've successfully sent a new email
        setError(null);
      } else {
        if (result.rateLimited) {
          setResendMsg(`Rate limited: ${result.message}`);
        } else {
          setResendMsg(result.error || result.message);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Resend failed';
      setResendMsg(msg);
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen gradient-indian-bg pattern-dots relative overflow-hidden">
      {/* Animated background elements with Indian colors */}
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-20 left-10 w-96 h-96 bg-manthan-saffron-400 rounded-full mix-blend-multiply filter blur-3xl animate-pulse"></div>
        <div className="absolute top-40 right-10 w-80 h-80 bg-manthan-gold-400 rounded-full mix-blend-multiply filter blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute bottom-20 left-1/2 w-72 h-72 bg-manthan-coral-400 rounded-full mix-blend-multiply filter blur-3xl animate-pulse delay-500"></div>
        <div className="absolute top-1/2 right-1/4 w-64 h-64 bg-manthan-mint-400 rounded-full mix-blend-multiply filter blur-3xl animate-pulse delay-300"></div>
      </div>

      {/* Decorative elements */}
      <div className="absolute top-10 left-10 text-manthan-saffron-300/30">
        <Sparkles className="w-8 h-8 animate-pulse" />
      </div>
      <div className="absolute top-20 right-20 text-manthan-gold-300/30">
        <Star className="w-6 h-6 animate-pulse delay-200" />
      </div>
      <div className="absolute bottom-20 left-20 text-manthan-coral-300/30">
        <Sparkles className="w-10 h-10 animate-pulse delay-400" />
      </div>

      <div className={cn("relative z-10 flex min-h-screen w-full items-center justify-center p-6 md:p-10", className)} {...props}>
        <div className="w-full max-w-md animate-fadeIn">
          {/* Back button */}
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-manthan-charcoal-600 hover:text-manthan-saffron-600 transition-colors mb-6 group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            <span className="font-medium">Back to home</span>
          </Link>

          {/* Login Card */}
          <div className="card-indian p-8 md:p-10 animate-slideUp">
            {/* Header with Indian aesthetics */}
            <div className="text-center mb-8">
              {/* Logo */}
              <div className="w-16 h-16 gradient-saffron rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-indian">
                <span className="text-white font-bold text-2xl font-heading">म</span>
              </div>

              <h1 className="text-3xl font-heading font-bold text-manthan-charcoal-800 mb-3">
                Welcome Back to{" "}
                <span className="text-gradient-indian">Manthan</span>
              </h1>
              <p className="text-manthan-charcoal-600 text-lg">
                Continue your creative storytelling journey
              </p>
            </div>

            {/* Info Banner for New Users */}
            <div className="mb-6 p-4 bg-manthan-royal-50 border border-manthan-royal-200/50 rounded-2xl">
              <p className="text-manthan-royal-700 text-sm text-center">
                <span className="font-semibold">New to Manthan?</span> After signing up, check your email for a confirmation link before signing in.
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleLogin} className="space-y-6">
              {/* Email Field */}
              <div className="space-y-3">
                <Label htmlFor="email" className="text-manthan-charcoal-800 font-semibold flex items-center gap-2">
                  <Mail className="w-4 h-4 text-manthan-saffron-500" />
                  Email Address
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="your@email.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-indian h-12 text-base"
                  disabled={isLoading}
                />
              </div>

              {/* Password Field */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-manthan-charcoal-800 font-semibold flex items-center gap-2">
                    <Lock className="w-4 h-4 text-manthan-saffron-500" />
                    Password
                  </Label>
                  <Link
                    href="/auth/forgot-password"
                    className="text-sm text-manthan-royal-600 hover:text-manthan-royal-700 font-medium transition-colors"
                  >
                    Forgot password?
                  </Link>
                </div>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-indian h-12 text-base"
                  disabled={isLoading}
                />
              </div>

              {/* Error Message */}
              {error && (
                <div className="bg-manthan-coral-50 border border-manthan-coral-200 text-manthan-coral-700 p-4 rounded-2xl text-sm animate-slideUp">
                  {error}
                </div>
              )}

              {/* Resend verification helper */}
              <div className="flex items-center justify-between text-sm">
                <span className="text-manthan-charcoal-500">Didn't get the email?</span>
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resending || isLoading}
                  className="text-manthan-royal-600 hover:text-manthan-royal-700 font-medium disabled:opacity-50 flex items-center gap-1"
                >
                  {resending && <RefreshCw className="w-3 h-3 animate-spin" />}
                  {resending ? 'Resending…' : 'Resend verification'}
                </button>
              </div>
              {resendMsg && (
                <p className={cn(
                  "text-xs mt-1",
                  resendMsg.includes('sent') || resendMsg.includes('Check')
                    ? "text-manthan-mint-600"
                    : "text-manthan-coral-600"
                )}>
                  {resendMsg}
                </p>
              )}

              {/* Login Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full btn-indian h-14 text-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
              >
                {isLoading ? (
                  <div className="flex items-center justify-center gap-3">
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    <span>Signing you in...</span>
                  </div>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <Sparkles className="w-5 h-5" />
                    Sign In to Manthan
                  </span>
                )}
              </button>
            </form>

            {/* Sign up link */}
            <div className="text-center mt-8 pt-6 border-t border-manthan-saffron-200/50">
              <p className="text-manthan-charcoal-600">
                Don't have an account yet?{" "}
                <Link
                  href="/auth/sign-up"
                  className="text-manthan-saffron-600 hover:text-manthan-gold-600 font-semibold transition-colors"
                >
                  Create your story
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}