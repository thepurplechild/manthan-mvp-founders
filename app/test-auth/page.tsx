"use client";

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { User, Mail, Check, X, AlertCircle, RefreshCw, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import type { User as SupabaseUser } from '@supabase/supabase-js';

export default function AuthTestPage() {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [testEmail, setTestEmail] = useState('test@example.com');
  const [testPassword, setTestPassword] = useState('password123');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const supabase = createClient();

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const clearMessages = () => {
    setMessage('');
    setError('');
  };

  const testSignUp = async () => {
    clearMessages();
    try {
      const { data, error } = await supabase.auth.signUp({
        email: testEmail,
        password: testPassword,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/confirm?next=/dashboard`,
        },
      });

      if (error) throw error;

      if (data.user && !data.user.email_confirmed_at) {
        setMessage(`✅ Signup successful! Check ${testEmail} for confirmation email.`);
      } else if (data.user && data.user.email_confirmed_at) {
        setMessage(`✅ User created and auto-confirmed!`);
      } else {
        setMessage(`⚠️ Signup response unclear: ${JSON.stringify(data)}`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(`❌ Signup failed: ${message}`);
    }
  };

  const testSignIn = async () => {
    clearMessages();
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: testEmail,
        password: testPassword,
      });

      if (error) throw error;
      setMessage(`✅ Login successful!`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(`❌ Login failed: ${message}`);
    }
  };

  const testPasswordReset = async () => {
    clearMessages();
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(testEmail, {
        redirectTo: `${window.location.origin}/auth/update-password`,
      });

      if (error) throw error;
      setMessage(`✅ Password reset email sent to ${testEmail}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(`❌ Password reset failed: ${message}`);
    }
  };

  const testSignOut = async () => {
    clearMessages();
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setMessage(`✅ Logout successful!`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(`❌ Logout failed: ${message}`);
    }
  };

  const testAuthState = async () => {
    clearMessages();
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) throw error;
      
      setMessage(`📋 Session: ${session ? 'Active' : 'None'}\n${session ? JSON.stringify(session.user, null, 2) : 'No user session'}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(`❌ Session check failed: ${message}`);
    }
  };

  const testEnvironment = () => {
    clearMessages();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    let envReport = '🔧 Environment Configuration:\n\n';
    
    // Check URL
    if (!url) {
      envReport += '❌ NEXT_PUBLIC_SUPABASE_URL: Missing\n';
    } else if (!url.includes('supabase.co')) {
      envReport += `❌ NEXT_PUBLIC_SUPABASE_URL: Invalid format (${url.substring(0, 30)}...)\n`;
    } else {
      const projectMatch = url.match(/https:\/\/([^.]+)\.supabase\.co/);
      const projectId = projectMatch ? projectMatch[1] : 'unknown';
      envReport += `✅ NEXT_PUBLIC_SUPABASE_URL: OK (Project: ${projectId})\n`;
      if (projectId !== 'wywshqihyhukpzamilam') {
        envReport += `⚠️  Expected project ID: wywshqihyhukpzamilam\n`;
      }
    }
    
    // Check Key
    if (!key) {
      envReport += '❌ NEXT_PUBLIC_SUPABASE_ANON_KEY: Missing\n';
    } else if (!key.startsWith('eyJ')) {
      envReport += `❌ NEXT_PUBLIC_SUPABASE_ANON_KEY: Invalid format\n`;
    } else {
      envReport += `✅ NEXT_PUBLIC_SUPABASE_ANON_KEY: OK (${key.substring(0, 20)}...)\n`;
    }
    
    // Check current domain
    envReport += `\n🌐 Current Domain: ${window.location.origin}\n`;
    envReport += `📧 Email redirect: ${window.location.origin}/auth/confirm\n`;
    envReport += `🔄 Password reset: ${window.location.origin}/auth/update-password\n`;
    
    setMessage(envReport);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-manthan-charcoal-900 flex items-center justify-center">
        <div className="flex items-center gap-3 text-white">
          <RefreshCw className="w-6 h-6 animate-spin" />
          <span>Loading authentication state...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-manthan-charcoal-900 via-manthan-charcoal-800 to-manthan-charcoal-900 p-6">
      <div className="container mx-auto max-w-4xl">
        <div className="mb-8">
          <Link 
            href="/dashboard" 
            className="inline-flex items-center gap-2 text-manthan-charcoal-300 hover:text-white transition-colors mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </Link>
          <h1 className="text-4xl font-bold text-white mb-4">🧪 Authentication Test Lab</h1>
          <p className="text-manthan-charcoal-300">
            Test all authentication functions to verify your configuration
          </p>
        </div>

        {/* Current User Status */}
        <Card className="mb-8 bg-manthan-charcoal-800/50 border-manthan-charcoal-600">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <User className="w-5 h-5" />
              Current Authentication State
            </CardTitle>
          </CardHeader>
          <CardContent>
            {user ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Badge className="bg-green-600 text-white">
                    <Check className="w-4 h-4 mr-1" />
                    Authenticated
                  </Badge>
                </div>
                <div className="bg-manthan-charcoal-700/50 p-4 rounded-lg">
                  <div className="text-sm text-manthan-charcoal-200">
                    <p><strong>Email:</strong> {user.email}</p>
                    <p><strong>ID:</strong> {user.id}</p>
                    <p><strong>Email Confirmed:</strong> {user.email_confirmed_at ? '✅ Yes' : '❌ No'}</p>
                    <p><strong>Created:</strong> {new Date(user.created_at).toLocaleString()}</p>
                    <p><strong>Last Sign In:</strong> {user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString() : 'Never'}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Badge variant="destructive">
                  <X className="w-4 h-4 mr-1" />
                  Not Authenticated
                </Badge>
                <span className="text-manthan-charcoal-300">No active session</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Test Controls */}
        <Card className="mb-8 bg-manthan-charcoal-800/50 border-manthan-charcoal-600">
          <CardHeader>
            <CardTitle className="text-white">🔧 Test Controls</CardTitle>
            <CardDescription className="text-manthan-charcoal-300">
              Configure test credentials and run authentication tests
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Test Credentials */}
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-white mb-2">Test Email</label>
                <Input
                  type="email"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  className="bg-manthan-charcoal-700 border-manthan-charcoal-600 text-white"
                  placeholder="test@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-white mb-2">Test Password</label>
                <Input
                  type="password"
                  value={testPassword}
                  onChange={(e) => setTestPassword(e.target.value)}
                  className="bg-manthan-charcoal-700 border-manthan-charcoal-600 text-white"
                  placeholder="password123"
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
              <Button
                onClick={testSignUp}
                className="bg-manthan-saffron-600 hover:bg-manthan-saffron-700 text-white"
              >
                📝 Sign Up
              </Button>
              <Button
                onClick={testSignIn}
                className="bg-manthan-royal-600 hover:bg-manthan-royal-700 text-white"
              >
                🔑 Sign In
              </Button>
              <Button
                onClick={testPasswordReset}
                className="bg-manthan-gold-600 hover:bg-manthan-gold-700 text-white"
              >
                🔄 Reset Password
              </Button>
              <Button
                onClick={testSignOut}
                variant="destructive"
                disabled={!user}
              >
                🚪 Sign Out
              </Button>
              <Button
                onClick={testAuthState}
                variant="outline"
                className="border-manthan-charcoal-600 text-white hover:bg-manthan-charcoal-700"
              >
                📊 Check State
              </Button>
              <Button
                onClick={testEnvironment}
                className="bg-manthan-charcoal-600 hover:bg-manthan-charcoal-700 text-white"
              >
                🔧 Check Config
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Results */}
        {(message || error) && (
          <Card className="mb-8 bg-manthan-charcoal-800/50 border-manthan-charcoal-600">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <AlertCircle className="w-5 h-5" />
                Test Results
              </CardTitle>
            </CardHeader>
            <CardContent>
              {message && (
                <div className="bg-green-900/20 border border-green-600/30 text-green-200 p-4 rounded-lg mb-4">
                  <pre className="whitespace-pre-wrap text-sm">{message}</pre>
                </div>
              )}
              {error && (
                <div className="bg-red-900/20 border border-red-600/30 text-red-200 p-4 rounded-lg">
                  <pre className="whitespace-pre-wrap text-sm">{error}</pre>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Configuration Tips */}
        <Card className="bg-manthan-charcoal-800/50 border-manthan-charcoal-600">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Mail className="w-5 h-5" />
              Configuration Checklist
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-sm text-manthan-charcoal-200">
              <div className="flex items-start gap-2">
                <span className="text-manthan-saffron-400 mt-0.5">✓</span>
                <span><strong>Site URL:</strong> Set to your production domain in dashboard</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-manthan-saffron-400 mt-0.5">✓</span>
                <span><strong>Redirect URLs:</strong> Add all auth callback URLs to allowlist</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-manthan-saffron-400 mt-0.5">✓</span>
                <span><strong>Email Confirmation:</strong> Enable in Authentication → Settings</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-manthan-saffron-400 mt-0.5">✓</span>
                <span><strong>SMTP:</strong> Configure custom email provider if needed</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-manthan-gold-400 mt-0.5">⚠</span>
                <span><strong>Rate Limits:</strong> Default is 4 emails/hour - try different emails if blocked</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}