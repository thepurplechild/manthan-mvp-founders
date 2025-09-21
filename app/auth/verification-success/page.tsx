"use client";

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle, ArrowRight, Home, User, Shield, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Enhanced Verification Success Page
 * Handles different verification states and provides appropriate next steps
 */
export default function VerificationSuccessPage() {
  const searchParams = useSearchParams();
  const [verificationState, setVerificationState] = useState<{
    isVerified: boolean;
    needsRights: boolean;
    isWelcome: boolean;
  }>({
    isVerified: false,
    needsRights: false,
    isWelcome: false
  });

  useEffect(() => {
    const verified = searchParams?.get('verified') === 'true';
    const needsRights = searchParams?.get('needs_rights') === 'true';
    const welcome = searchParams?.get('welcome') === 'true';

    setVerificationState({
      isVerified: verified,
      needsRights: needsRights,
      isWelcome: welcome
    });
  }, [searchParams]);

  const { isVerified, needsRights, isWelcome } = verificationState;

  return (
    <div className="min-h-screen gradient-indian-bg flex items-center justify-center p-6">
      <div className="max-w-md w-full">
        <div className="card-indian p-8 text-center animate-slideUp">
          {/* Success Icon */}
          <div className="mx-auto w-20 h-20 bg-gradient-to-br from-manthan-mint-500 to-manthan-teal-600 rounded-full flex items-center justify-center mb-6 shadow-indian">
            <CheckCircle className="w-10 h-10 text-white" />
          </div>

          {/* Dynamic Success Message */}
          <h1 className="text-3xl font-heading font-bold text-manthan-charcoal-800 mb-4">
            {isWelcome ? 'Welcome to Manthan! 🎉' : 'Email Verified Successfully! ✅'}
          </h1>

          {needsRights ? (
            <div className="mb-8">
              <p className="text-manthan-charcoal-600 mb-4 leading-relaxed">
                Great! Your email has been verified. To complete your account setup, please accept our Creator's Bill of Rights.
              </p>
              <div className="bg-manthan-royal-50 border border-manthan-royal-200 rounded-2xl p-4 mb-6">
                <div className="flex items-center gap-2 text-manthan-royal-700 mb-2">
                  <Shield className="w-5 h-5" />
                  <span className="font-semibold">One More Step</span>
                </div>
                <p className="text-sm text-manthan-royal-600">
                  Accept our Creator's Bill of Rights to protect your intellectual property and start using the platform.
                </p>
              </div>
            </div>
          ) : (
            <p className="text-manthan-charcoal-600 mb-8 leading-relaxed">
              {isWelcome
                ? 'Your account is fully verified and ready to use. Start transforming your scripts into professional pitch decks!'
                : 'Your account has been activated and you can now access all features of the platform.'
              }
            </p>
          )}

          {/* Action Buttons */}
          <div className="space-y-4">
            {needsRights ? (
              <Link href="/auth/accept-rights?verified=true">
                <Button className="w-full btn-indian text-white py-3 rounded-xl font-semibold transition-all duration-300">
                  <Shield className="w-5 h-5 mr-2" />
                  Accept Creator's Rights
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </Link>
            ) : (
              <Link href="/dashboard">
                <Button className="w-full btn-indian text-white py-3 rounded-xl font-semibold transition-all duration-300">
                  <User className="w-5 h-5 mr-2" />
                  Go to Dashboard
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </Link>
            )}

            <Link href="/">
              <Button variant="outline" className="w-full btn-outline-indian py-3 rounded-xl transition-all duration-300">
                <Home className="w-5 h-5 mr-2" />
                Back to Home
              </Button>
            </Link>
          </div>

          {/* Next Steps */}
          <div className="mt-8 pt-6 border-t border-manthan-saffron-200/50">
            {needsRights ? (
              <div className="text-center">
                <p className="text-sm text-manthan-charcoal-600 mb-2">
                  <Clock className="w-4 h-4 inline mr-1" />
                  Almost there! Just one more step to complete your setup.
                </p>
                <p className="text-xs text-manthan-charcoal-500">
                  Our Creator's Bill of Rights ensures your intellectual property is protected while using Manthan.
                </p>
              </div>
            ) : (
              <div className="text-center">
                <p className="text-sm text-manthan-charcoal-600 mb-2">
                  🚀 Ready to transform your scripts?
                </p>
                <p className="text-xs text-manthan-charcoal-500">
                  Upload your first script and watch AI create professional pitch decks tailored for the Indian entertainment industry.
                </p>
              </div>
            )}
          </div>

          {/* Additional Help */}
          <div className="mt-6 pt-4 border-t border-manthan-saffron-200/30">
            <p className="text-xs text-manthan-charcoal-500">
              Need help? {' '}
              <a
                href="mailto:support@manthan.app"
                className="text-manthan-saffron-600 hover:text-manthan-gold-600 font-medium"
              >
                Contact our support team
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}