// app/page.tsx - Indian-inspired Landing Page
'use client'

import Link from 'next/link'
import { ArrowRight, Shield, Star } from 'lucide-react'
import { useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

// Component to handle search params with Suspense boundary
function SearchParamsHandler() {
  const router = useRouter()
  const searchParams = useSearchParams()
  
  // Handle email verification redirects
  useEffect(() => {
    const code = searchParams.get('code')
    if (code) {
      // Redirect to proper confirmation route
      const next = searchParams.get('next') || '/dashboard'
      router.replace(`/auth/confirm?code=${code}&next=${encodeURIComponent(next)}`)
      return
    }
  }, [searchParams, router])
  
  return null
}

// Loading fallback component
function SearchParamsFallback() {
  return <div style={{ display: 'none' }}>Loading...</div>
}

// Main homepage component
function HomePageContent() {
  return (
    <div className="min-h-screen relative overflow-hidden gradient-indian-bg">
      {/* Faint geometric motif overlay */}
      <div className="absolute inset-0 bg-indian-motif" />

      {/* Hero Section */}
      <section className="relative z-10 container mx-auto px-6 py-24 text-center">
        <div className="max-w-5xl mx-auto">
          <div className="mb-8">
            <div className="inline-flex items-center px-4 py-2 bg-white/70 rounded-full border border-manthan-gold-200/50 text-sm text-manthan-charcoal-700 mb-8 shadow-soft">
              <Star className="w-4 h-4 mr-2 text-manthan-gold-500" />
              Trusted by 500+ creators in the founding cohort
            </div>
          </div>
          
          <h1 className="text-5xl md:text-6xl font-heading font-bold mb-6 leading-tight text-manthan-charcoal-800">
            Transform Your <span className="text-gradient-indian">Stories</span> Into Success
          </h1>
          
          <p className="text-lg md:text-xl text-manthan-charcoal-600 mb-10 leading-relaxed max-w-3xl mx-auto">
            The AI-powered platform that turns your scripts into professional pitch decks and connects you with the right buyers in the Indian entertainment industry.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-6 justify-center items-center">
            <Link 
              href="/auth/sign-up"
              className="btn-indian flex items-center gap-3"
            >
              Start Your Journey 
              <ArrowRight className="w-5 h-5" />
            </Link>
            <Link href="/auth/login" className="btn-royal">Login</Link>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="relative z-10 container mx-auto px-6 py-24">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-heading font-semibold text-manthan-charcoal-800 mb-4">
            Why Creators Choose Manthan
          </h2>
          <p className="text-lg text-manthan-charcoal-600 max-w-2xl mx-auto">
            Built for the Indian entertainment ecosystem with cutting-edge AI and industry expertise
          </p>
        </div>
        
        <div className="grid md:grid-cols-3 gap-8">
          <div className="group relative card-indian p-8">
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-manthan-saffron-100/50 to-manthan-gold-100/50 opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="relative">
              <h3 className="text-xl font-semibold text-manthan-charcoal-800 mb-2">AI Pitch Decks</h3>
              <p className="text-manthan-charcoal-600">Generate polished pitch decks tailored for Indian studios and OTT platforms.</p>
            </div>
          </div>
          <div className="group relative card-indian p-8">
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-manthan-royal-100/50 to-manthan-teal-100/50 opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="relative">
              <h3 className="text-xl font-semibold text-manthan-charcoal-800 mb-2">Smart Matching</h3>
              <p className="text-manthan-charcoal-600">Connect with producers seeking your genre, language, and budget profile.</p>
            </div>
          </div>
          <div className="group relative card-indian p-8">
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-manthan-coral-100/50 to-manthan-mint-100/50 opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="relative">
              <h3 className="text-xl font-semibold text-manthan-charcoal-800 mb-2">Insights & A/B</h3>
              <p className="text-manthan-charcoal-600">Improve scripts with feedback loops, audience signals, and pitch analytics.</p>
            </div>
          </div>
        
        </div>
      </section>

      {/* Trust Section */}
      <section className="relative z-10 container mx-auto px-6 py-24">
        <div className="relative card-premium p-10 md:p-14">
          <div className="relative">
            <div className="flex items-center justify-center mb-8">
              <div className="gradient-royal p-4 rounded-2xl mr-4 shadow-soft">
                <Shield className="w-10 h-10 text-white" />
              </div>
              <h2 className="text-3xl md:text-4xl font-heading font-bold text-manthan-charcoal-800">Your IP is Protected</h2>
            </div>
            <div className="max-w-4xl mx-auto text-center">
              <p className="text-lg text-manthan-charcoal-600 leading-relaxed mb-10">
                We understand your script is your most valuable asset. Creator-first principles, transparency, and ironclad IP protection are built in.
              </p>
              <div className="grid md:grid-cols-3 gap-6">
                <div className="card-indian p-6">
                  <h4 className="text-manthan-charcoal-800 font-semibold mb-2 text-lg">Never Shared Without Permission</h4>
                  <p className="text-manthan-charcoal-600">Your scripts are only used to generate your pitch materials.</p>
                </div>
                <div className="card-indian p-6">
                  <h4 className="text-manthan-charcoal-800 font-semibold mb-2 text-lg">No Third-Party Training</h4>
                  <p className="text-manthan-charcoal-600">Your IP will never be used to train public AI models.</p>
                </div>
                <div className="card-indian p-6">
                  <h4 className="text-manthan-charcoal-800 font-semibold mb-2 text-lg">Full Control</h4>
                  <p className="text-manthan-charcoal-600">You decide exactly who sees your work and when.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative z-10 container mx-auto px-6 py-24 text-center">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-heading font-bold text-manthan-charcoal-800 mb-6">
            Ready to Transform Your Script?
          </h2>
          <p className="text-lg text-manthan-charcoal-600 mb-10 leading-relaxed">
            Join the founding cohort of creators who are revolutionizing how stories get discovered in India.
          </p>
          <Link 
            href="/auth/sign-up"
            className="group inline-flex items-center gap-4 px-10 py-4 btn-indian text-lg"
          >
            Join the Founding Cohort 
            <ArrowRight className="w-6 h-6" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-manthan-saffron-200/40">
        <div className="container mx-auto px-6 py-12 text-center">
          <div className="text-2xl font-heading font-bold mb-2 text-manthan-charcoal-800">Manthan</div>
          <p className="text-manthan-charcoal-600">Transforming stories into success, one script at a time.</p>
        </div>
      </footer>
    </div>
  )
}

// Main export with Suspense boundary
export default function HomePage() {
  return (
    <>
      <Suspense fallback={<SearchParamsFallback />}>
        <SearchParamsHandler />
      </Suspense>
      <HomePageContent />
    </>
  )
}

