'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function ProductionDebugPage() {
  interface DiagnosticsData {
    isProduction?: boolean;
    hasSupabaseUrl?: boolean;
    hasSupabaseKey?: boolean;
    supabaseUrl?: string;
    currentHost?: string;
    userAgent?: string;
    environment?: Record<string, unknown>;
    supabase?: Record<string, unknown>;
    database?: Record<string, unknown>;
    storage?: Record<string, unknown>;
    api?: Record<string, unknown>;
  }
  
  interface TestResults {
    connectionTest?: 'success' | 'failed' | 'exception';
    connectionError?: string;
    currentUser?: string | null;
    signUpTest?: 'success' | 'failed' | 'exception';
    signUpError?: string;
    signUpUserId?: string;
    emailConfirmed?: boolean;
    signInTest?: 'success' | 'failed' | 'exception';
    signInError?: string;
    signInUserId?: string;
    networkTest?: 'success' | 'failed' | 'exception';
    networkError?: string;
    supabaseConnection?: boolean;
    databaseRead?: boolean;
    storageAccess?: boolean;
    apiEndpoints?: Record<string, boolean>;
  }
  
  const [diagnostics, setDiagnostics] = useState<DiagnosticsData>({})
  const [logs, setLogs] = useState<string[]>([])
  const [testResults, setTestResults] = useState<TestResults>({})

  const addLog = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString()
    setLogs(prev => [...prev, `${timestamp}: ${message}`])
  }, [])

  const runFullDiagnostics = useCallback(async () => {
    addLog('🔍 Starting production diagnostics...')

    // Check environment
    const envCheck = {
      isProduction: process.env.NODE_ENV === 'production',
      hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      hasSupabaseKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL?.substring(0, 30) + '...',
      currentHost: typeof window !== 'undefined' ? window.location.host : 'server-side',
      userAgent: typeof window !== 'undefined' ? window.navigator.userAgent.substring(0, 50) : 'N/A'
    }

    setDiagnostics(envCheck)
    addLog(`Environment: ${envCheck.isProduction ? 'Production' : 'Development'}`)
    addLog(`Host: ${envCheck.currentHost}`)
    addLog(`Supabase URL configured: ${envCheck.hasSupabaseUrl}`)

    // Test Supabase connection
    try {
      addLog('🔗 Testing Supabase connection...')
      const supabase = createClient()
      
      // Test basic connection
      const { error } = await supabase.from('profiles').select('count').limit(1)
      
      if (error) {
        addLog(`❌ Supabase connection error: ${error.message}`)
        setTestResults((prev) => ({ ...prev, connectionTest: 'failed', connectionError: error.message }))
      } else {
        addLog('✅ Supabase connection successful')
        setTestResults((prev) => ({ ...prev, connectionTest: 'success' }))
      }

      // Test auth status
      const { data: { user } } = await supabase.auth.getUser()
      addLog(`Current user: ${user ? `${user.email} (${user.id.substring(0, 8)}...)` : 'None'}`)
      setTestResults((prev) => ({ ...prev, currentUser: user ? user.email : null }))

    } catch (error) {
      addLog(`💥 Connection exception: ${error instanceof Error ? error.message : String(error)}`)
      setTestResults((prev) => ({ ...prev, connectionTest: 'exception', connectionError: String(error) }))
    }
  }, [addLog])

  useEffect(() => {
    runFullDiagnostics()
  }, [runFullDiagnostics])

  const testSignUp = async () => {
    const testEmail = `test-${Date.now()}@example.com`
    const testPassword = 'TestPassword123!'

    addLog(`🧪 Testing sign-up with: ${testEmail}`)
    
    try {
      const supabase = createClient()
      
      const { data, error } = await supabase.auth.signUp({
        email: testEmail,
        password: testPassword,
      })

      if (error) {
        addLog(`❌ Sign-up error: ${error.message}`)
        setTestResults((prev) => ({ ...prev, signUpTest: 'failed', signUpError: error.message }))
      } else {
        addLog(`✅ Sign-up successful! User: ${data.user?.id?.substring(0, 8) || 'unknown'}`)
        addLog(`Email confirmed: ${!!data.user?.email_confirmed_at}`)
        setTestResults((prev) => ({ 
          ...prev, 
          signUpTest: 'success', 
          signUpUserId: data.user?.id,
          emailConfirmed: !!data.user?.email_confirmed_at 
        }))
      }
    } catch (error) {
      addLog(`💥 Sign-up exception: ${error instanceof Error ? error.message : String(error)}`)
      setTestResults((prev) => ({ ...prev, signUpTest: 'exception', signUpError: String(error) }))
    }
  }

  const testSignIn = async () => {
    const testEmail = 'test@example.com'
    const testPassword = 'testpassword123'

    addLog(`🔐 Testing sign-in with: ${testEmail}`)
    
    try {
      const supabase = createClient()
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email: testEmail,
        password: testPassword,
      })

      if (error) {
        addLog(`❌ Sign-in error: ${error.message}`)
        setTestResults((prev) => ({ ...prev, signInTest: 'failed', signInError: error.message }))
      } else {
        addLog(`✅ Sign-in successful! User: ${data.user?.id?.substring(0, 8) || 'unknown'}`)
        setTestResults((prev) => ({ ...prev, signInTest: 'success', signInUserId: data.user?.id }))
      }
    } catch (error) {
      addLog(`💥 Sign-in exception: ${error instanceof Error ? error.message : String(error)}`)
      setTestResults((prev) => ({ ...prev, signInTest: 'exception', signInError: String(error) }))
    }
  }

  const checkNetworkConnectivity = async () => {
    addLog('🌐 Testing network connectivity...')
    
    try {
      // Test basic fetch to Supabase
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      if (!supabaseUrl) {
        addLog('❌ No Supabase URL configured')
        return
      }

      const response = await fetch(`${supabaseUrl}/rest/v1/`, {
        method: 'HEAD',
        headers: {
          'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''}`
        }
      })

      if (response.ok) {
        addLog('✅ Network connectivity to Supabase: OK')
        setTestResults((prev) => ({ ...prev, networkTest: 'success' }))
      } else {
        addLog(`❌ Network error: ${response.status} ${response.statusText}`)
        setTestResults((prev) => ({ ...prev, networkTest: 'failed', networkError: `${response.status} ${response.statusText}` }))
      }
    } catch (error) {
      addLog(`💥 Network exception: ${error instanceof Error ? error.message : String(error)}`)
      setTestResults((prev) => ({ ...prev, networkTest: 'exception', networkError: String(error) }))
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-purple-950 to-pink-950 p-4">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold text-white mb-8">🚀 Production Debug Console</h1>
        
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Environment Info */}
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
            <h2 className="text-xl font-semibold text-white mb-4">Environment</h2>
            <div className="space-y-2 text-sm">
              {Object.entries(diagnostics).map(([key, value]) => (
                <div key={key} className="flex justify-between">
                  <span className="text-white/70">{key}:</span>
                  <span className="text-white font-mono">{String(value)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Test Results */}
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
            <h2 className="text-xl font-semibold text-white mb-4">Test Results</h2>
            <div className="space-y-2 text-sm">
              {Object.entries(testResults).map(([key, value]) => (
                <div key={key} className="flex justify-between">
                  <span className="text-white/70">{key}:</span>
                  <span className={`font-mono text-xs ${
                    String(value).includes('success') ? 'text-green-300' :
                    String(value).includes('failed') || String(value).includes('exception') ? 'text-red-300' :
                    'text-white'
                  }`}>
                    {String(value).substring(0, 30)}
                    {String(value).length > 30 && '...'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Controls */}
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
            <h2 className="text-xl font-semibold text-white mb-4">Test Controls</h2>
            <div className="space-y-3">
              <button
                onClick={runFullDiagnostics}
                className="w-full p-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm"
              >
                Run Full Diagnostics
              </button>
              <button
                onClick={checkNetworkConnectivity}
                className="w-full p-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm"
              >
                Test Network
              </button>
              <button
                onClick={testSignUp}
                className="w-full p-3 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm"
              >
                Test Sign Up
              </button>
              <button
                onClick={testSignIn}
                className="w-full p-3 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-sm"
              >
                Test Sign In
              </button>
            </div>
          </div>
        </div>

        {/* Logs */}
        <div className="mt-8 bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-white">Debug Logs</h2>
            <button
              onClick={() => setLogs([])}
              className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-sm"
            >
              Clear
            </button>
          </div>
          <div className="bg-black/30 rounded-lg p-4 h-96 overflow-y-auto font-mono text-sm">
            {logs.length === 0 ? (
              <p className="text-white/50">No logs yet...</p>
            ) : (
              <div className="space-y-1">
                {logs.map((log, index) => (
                  <p key={index} className="text-white/90">{log}</p>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Quick Access Info */}
        <div className="mt-6 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
          <p className="text-yellow-100 text-sm">
            <strong>💡 Quick Check:</strong> Compare results between localhost:3000/debug-production and your-app.vercel.app/debug-production
          </p>
        </div>
      </div>
    </div>
  )
}