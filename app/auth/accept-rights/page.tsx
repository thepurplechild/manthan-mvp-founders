"use client";

import { useState, useEffect, Suspense } from "react";
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
import { Shield, FileText, ArrowRight, AlertCircle } from "lucide-react";

function AcceptRightsContent() {
  const [acceptedRights, setAcceptedRights] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get('redirect') || '/dashboard';

  useEffect(() => {
    const getUser = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    };
    getUser();
  }, []);

  const handleAcceptRights = async () => {
    if (!acceptedRights || !user) {
      setError("You must accept the Creator's Bill of Rights to continue");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/rights/accept', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ version: '1.0 - MVP Launch' }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const message =
          typeof payload?.error === 'string' && payload.error.trim().length > 0
            ? payload.error
            : 'Unable to record your acceptance. Please try again.';
        throw new Error(message);
      }

      // Redirect to the intended destination
      router.push(redirectUrl as any);
    } catch (error: unknown) {
      console.error("Error recording rights acceptance:", error);
      const msg = error instanceof Error ? error.message : "An error occurred";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/');
  };

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
            </div>

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
                />
                <label htmlFor="rights-agreement" className="text-sm leading-relaxed text-white cursor-pointer">
                  I have read and agree to the Creator's Bill of Rights. I understand that my intellectual property will be protected and used only for generating my pitch materials.
                </label>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-500/10 backdrop-blur-xl border border-red-500/20 text-red-300 p-4 rounded-xl text-sm mb-6">
                {error}
              </div>
            )}

            {/* Action Buttons */}
            <div className="space-y-4">
              <button
                type="button"
                onClick={handleAcceptRights}
                disabled={isLoading || !acceptedRights}
                className="w-full h-12 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-semibold rounded-xl shadow-lg shadow-purple-500/25 backdrop-blur-sm border border-white/20 transition-all duration-300 hover:scale-105 hover:shadow-xl hover:shadow-purple-500/40 disabled:opacity-50 disabled:hover:scale-100 flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    Recording acceptance...
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
                className="w-full h-12 bg-white/10 backdrop-blur-xl border border-white/20 text-white hover:bg-white/20 rounded-xl transition-all duration-300"
              >
                Sign Out Instead
              </button>
            </div>

            {/* Footer */}
            <div className="text-center mt-8">
              <p className="text-white/40 text-sm">
                This acceptance is required to ensure your creative work is properly protected on our platform.
              </p>
            </div>
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
        <div className="text-white">Loading...</div>
      </div>
    }>
      <AcceptRightsContent />
    </Suspense>
  );
}
