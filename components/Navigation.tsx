import Link from 'next/link'
import { AuthButton } from './auth-button'
import { Film, Sparkles } from 'lucide-react'

export default function Navigation() {
  return (
    <nav className="nav-glass sticky top-0 z-50 border-b border-manthan-saffron-200/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-20">
          {/* Logo and Brand */}
          <div className="flex items-center">
            <Link href="/" className="flex items-center space-x-3 group">
              {/* Logo with Indian-inspired design */}
              <div className="relative">
                <div className="w-12 h-12 gradient-saffron rounded-2xl flex items-center justify-center shadow-indian group-hover:shadow-glow transition-all duration-300 group-hover:scale-105">
                  <span className="text-white font-bold text-xl font-heading">म</span>
                </div>
                <div className="absolute -top-1 -right-1 w-4 h-4 gradient-warm rounded-full animate-pulse"></div>
              </div>
              
              {/* Brand Name */}
              <div className="flex flex-col">
                <span className="text-2xl font-heading font-bold text-manthan-charcoal-800 group-hover:text-gradient-indian transition-all duration-300">
                  Manthan
                </span>
                <span className="text-xs font-medium text-manthan-charcoal-600 tracking-wider">
                  MEDIA PLATFORM
                </span>
              </div>
            </Link>
          </div>
          
          {/* Navigation Links */}
          <div className="flex items-center space-x-2">
            {/* Dashboard Link */}
            <Link 
              href="/dashboard" 
              className="group relative px-4 py-2 rounded-xl text-manthan-charcoal-600 hover:text-manthan-saffron-600 font-medium transition-all duration-300 hover:bg-manthan-saffron-50"
            >
              <span className="relative z-10 flex items-center space-x-2">
                <Film className="w-4 h-4" />
                <span>Dashboard</span>
              </span>
              <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-manthan-saffron-100 to-manthan-gold-100 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            </Link>
            
            {/* Projects Link */}
            <Link 
              href="/projects/new" 
              className="group relative px-4 py-2 rounded-xl text-manthan-charcoal-600 hover:text-manthan-royal-600 font-medium transition-all duration-300 hover:bg-manthan-royal-50"
            >
              <span className="relative z-10 flex items-center space-x-2">
                <Sparkles className="w-4 h-4" />
                <span>Projects</span>
              </span>
              <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-manthan-royal-100 to-manthan-teal-100 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            </Link>
            
            {/* Primary CTA Button */}
            <Link 
              href="/projects/new"
              className="btn-indian relative overflow-hidden ml-4"
            >
              <span className="relative z-10 flex items-center space-x-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                </svg>
                <span className="font-medium">Upload Script</span>
              </span>
              {/* Shimmer effect */}
              <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
            </Link>
            
            {/* Auth Button */}
            <div className="ml-4 pl-4 border-l border-manthan-saffron-200/50">
              <AuthButton />
            </div>
          </div>
        </div>
      </div>
      
      {/* Decorative bottom gradient */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-manthan-saffron-300 to-transparent"></div>
    </nav>
  );
}