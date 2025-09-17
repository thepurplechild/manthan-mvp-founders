'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function AuthDebugPage() {
  const [status, setStatus] = useState<string>('Initializing...')
  const [logs, setLogs] = useState<string[]>([])
  const [testEmail, setTestEmail] = useState('test@example.com')
  const [testPassword, setTestPassword] = useState('testpassword123')

  const addLog = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString()
    setLogs(prev => [...prev, `${timestamp}: ${message}`])
  }, [])

  const checkSupabaseConnection = useCallback(async () => {
    try {
      addLog('Creating Supabase client...')
      const supabase = createClient()
      
      addLog('Testing Supabase connection...')
      const { error } = await supabase.from('profiles').select('count').limit(1)
      
      if (error) {
        addLog(`Supabase connection error: ${error.message}`)
        setStatus('Connection Error')
      } else {
        addLog('Supabase connection successful')
        setStatus('Connected')
      }

      // Test auth status
      const { data: { user } } = await supabase.auth.getUser()
      addLog(`Current user: ${user ? user.email : 'Not authenticated'}`)
      
    } catch (error) {
      addLog(`Unexpected error: ${error instanceof Error ? error.message : String(error)}`)
      setStatus('Error')
    }
  }, [addLog])

  useEffect(() => {
    checkSupabaseConnection()
  }, [checkSupabaseConnection])

  const testSignUp = async () => {
    try {
      addLog('Starting sign-up test...')
      const supabase = createClient()
      
      const { data, error } = await supabase.auth.signUp({
        email: testEmail,
        password: testPassword,
        options: {
          data: {
            full_name: 'Test User',
          }
        },
      })

      if (error) {
        addLog(`Sign-up error: ${error.message}`)
      } else {
        addLog(`Sign-up successful! User ID: ${data.user?.id}`)
        addLog(`Email confirmation required: ${!data.user?.email_confirmed_at}`)
      }
    } catch (error) {
      addLog(`Sign-up exception: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const testSignIn = async () => {
    try {
      addLog('Starting sign-in test...')
      const supabase = createClient()
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email: testEmail,
        password: testPassword,
      })

      if (error) {
        addLog(`Sign-in error: ${error.message}`)
      } else {
        addLog(`Sign-in successful! User ID: ${data.user?.id}`)
      }
    } catch (error) {
      addLog(`Sign-in exception: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const checkAuthSettings = async () => {
    try {
      addLog('Checking auth settings...')
      const supabase = createClient()
      
      // Try to get the current session
      const { data: { session } } = await supabase.auth.getSession()
      addLog(`Current session: ${session ? 'Active' : 'None'}`)
      
      // Check environment variables
      addLog(`SUPABASE_URL: ${process.env.NEXT_PUBLIC_SUPABASE_URL ? 'Set' : 'Missing'}`)
      addLog(`SUPABASE_ANON_KEY: ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'Set' : 'Missing'}`)
      
    } catch (error) {
      addLog(`Auth settings error: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-purple-950 to-pink-950 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-white mb-8">Authentication Debug</h1>
        
        <div className="grid lg:grid-cols-2 gap-8">
          {/* Status Panel */}
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
            <h2 className="text-2xl font-semibold text-white mb-4">Connection Status</h2>
            <div className={`text-lg font-medium p-3 rounded-lg ${
              status === 'Connected' ? 'bg-green-600/20 text-green-300' :
              status === 'Error' || status === 'Connection Error' ? 'bg-red-600/20 text-red-300' :
              'bg-yellow-600/20 text-yellow-300'
            }`}>
              {status}
            </div>
            
            <div className="mt-6 space-y-3">
              <button
                onClick={checkSupabaseConnection}
                className="w-full p-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                Test Connection
              </button>
              <button
                onClick={checkAuthSettings}
                className="w-full p-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
              >
                Check Auth Settings
              </button>
            </div>
          </div>

          {/* Test Panel */}
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
            <h2 className="text-2xl font-semibold text-white mb-4">Authentication Tests</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-white mb-2">Test Email:</label>
                <input
                  type="email"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  className="w-full p-3 bg-white/20 border border-white/30 rounded-lg text-white placeholder-white/50"
                />
              </div>
              
              <div>
                <label className="block text-white mb-2">Test Password:</label>
                <input
                  type="password"
                  value={testPassword}
                  onChange={(e) => setTestPassword(e.target.value)}
                  className="w-full p-3 bg-white/20 border border-white/30 rounded-lg text-white placeholder-white/50"
                />
              </div>
              
              <div className="flex gap-3">
                <button
                  onClick={testSignUp}
                  className="flex-1 p-3 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                >
                  Test Sign Up
                </button>
                <button
                  onClick={testSignIn}
                  className="flex-1 p-3 bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition-colors"
                >
                  Test Sign In
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Logs Panel */}
        <div className="mt-8 bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
          <h2 className="text-2xl font-semibold text-white mb-4">Debug Logs</h2>
          <div className="bg-black/30 rounded-lg p-4 h-96 overflow-y-auto">
            {logs.length === 0 ? (
              <p className="text-white/50 text-sm">No logs yet...</p>
            ) : (
              <div className="space-y-1">
                {logs.map((log, index) => (
                  <p key={index} className="text-white/80 text-sm font-mono">{log}</p>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={() => setLogs([])}
            className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
          >
            Clear Logs
          </button>
        </div>
      </div>
    </div>
  )
}