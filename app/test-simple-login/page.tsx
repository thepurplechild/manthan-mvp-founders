'use client'

import { createClient } from '@/lib/supabase/client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function SimpleLoginTest() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    console.log('🔥 Form submitted!')
    console.log('Form data:', { email, password: '***' })
    
    setIsLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      console.log('📡 Supabase client created:', !!supabase)
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      
      console.log('🔐 Auth response:', { 
        user: data?.user?.id, 
        error: error?.message,
        session: !!data?.session 
      })
      
      if (error) throw error
      
      console.log('✅ Login successful, redirecting...')
      router.push('/dashboard')
    } catch (error) {
      console.error('❌ Login error:', error)
      setError(error instanceof Error ? error.message : 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-purple-950 to-pink-950 p-8">
      <div className="max-w-md mx-auto">
        <h1 className="text-3xl font-bold text-white mb-8">Simple Login Test</h1>
        
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-white mb-2">Email:</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full p-3 bg-white/20 border border-white/30 rounded-lg text-white placeholder:text-white/60"
                placeholder="test@example.com"
              />
            </div>
            
            <div>
              <label className="block text-white mb-2">Password:</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full p-3 bg-white/20 border border-white/30 rounded-lg text-white placeholder:text-white/60"
                placeholder="password"
              />
            </div>
            
            {error && (
              <div className="p-4 bg-red-500/20 border border-red-500/30 rounded-lg text-red-200 text-sm">
                {error}
              </div>
            )}
            
            <button
              type="submit"
              disabled={isLoading}
              className="w-full p-3 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 text-white rounded-lg transition-colors"
            >
              {isLoading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
          
          <div className="mt-6 p-4 bg-white/5 rounded-lg">
            <h3 className="text-white font-semibold mb-2">Debug Info:</h3>
            <pre className="text-white/60 text-xs">
              {`Email: ${email}
Password: ${password ? '***' : '(empty)'}
Loading: ${isLoading}
Error: ${error || 'none'}`}
            </pre>
          </div>
        </div>
      </div>
    </div>
  )
}