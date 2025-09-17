"use client";

import Link from 'next/link';
import { CheckCircle, ArrowRight, Home, User } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function VerificationSuccessPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-manthan-charcoal-900 via-manthan-charcoal-800 to-manthan-charcoal-900 flex items-center justify-center p-6">
      <div className="max-w-md w-full">
        <div className="bg-manthan-charcoal-800/50 backdrop-blur-sm rounded-3xl border border-manthan-charcoal-600/50 shadow-2xl p-8 text-center">
          {/* Success Icon */}
          <div className="mx-auto w-20 h-20 bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center mb-6 shadow-lg shadow-green-500/25">
            <CheckCircle className="w-10 h-10 text-white" />
          </div>

          {/* Success Message */}
          <h1 className="text-2xl font-bold text-white mb-4">
            Email Verified Successfully! 🎉
          </h1>
          <p className="text-manthan-charcoal-300 mb-8 leading-relaxed">
            Welcome to Manthan! Your account has been activated and you can now access all features of the platform.
          </p>

          {/* Action Buttons */}
          <div className="space-y-4">
            <Link href="/dashboard">
              <Button className="w-full bg-manthan-saffron-600 hover:bg-manthan-saffron-700 text-white py-3 rounded-xl font-semibold shadow-lg shadow-manthan-saffron-500/25 transition-all duration-300 hover:shadow-xl hover:shadow-manthan-saffron-500/40">
                <User className="w-5 h-5 mr-2" />
                Go to Dashboard
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>
            
            <Link href="/">
              <Button variant="outline" className="w-full border-manthan-charcoal-600 text-manthan-charcoal-300 hover:text-white hover:bg-manthan-charcoal-700 py-3 rounded-xl transition-all duration-300">
                <Home className="w-5 h-5 mr-2" />
                Back to Home
              </Button>
            </Link>
          </div>

          {/* Next Steps */}
          <div className="mt-8 pt-6 border-t border-manthan-charcoal-600/50">
            <p className="text-sm text-manthan-charcoal-400 mb-3">
              🚀 Ready to transform your scripts?
            </p>
            <p className="text-xs text-manthan-charcoal-500">
              Upload your first script and watch AI create professional pitch decks tailored for the Indian entertainment industry.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}