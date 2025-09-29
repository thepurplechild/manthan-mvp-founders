/**
 * Founder Layout - Protected Route Group for Founder-Only Pages
 *
 * This layout component wraps all pages in the (founder) route group and provides
 * server-side authorization before any page content is rendered.
 *
 * Authorization Flow:
 * 1. Fetch user profile using getUserProfile()
 * 2. If no authenticated user → redirect to /login
 * 3. If user is not a founder → redirect to /dashboard (creator dashboard)
 * 4. If authorized → render child pages
 *
 * Protected Routes:
 * - /founder/dashboard (command center)
 * - /founder/projects/* (project review pages)
 * - Any other routes placed in the (founder) folder
 */

import { redirect } from 'next/navigation'
import { getUserProfile } from '@/lib/user-profile'

/**
 * Props interface for the layout component
 */
interface FounderLayoutProps {
  children: React.ReactNode
}

/**
 * Founder Layout Component
 * Server Component that provides route protection for founder-only pages
 */
export default async function FounderLayout({ children }: FounderLayoutProps) {
  // Fetch user profile with role information on the server
  const profile = await getUserProfile()

  // Authorization Check 1: User must be authenticated
  if (!profile) {
    redirect('/auth/login')
  }

  // Authorization Check 2: User must have founder role
  if (profile.role !== 'founder') {
    // Redirect non-founders to creator dashboard
    // This prevents creators from accessing founder-only routes
    redirect('/dashboard')
  }

  // If we reach here, user is authenticated and has founder role
  // Render the child pages with founder-specific styling
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Optional: Founder-specific header/navigation */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div>
              <h1 className="text-xl font-semibold text-gray-900">
                Founder Command Center
              </h1>
              <p className="text-sm text-gray-600">
                Administrative oversight and project management
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-500">
                Signed in as <span className="font-medium text-gray-900">{profile.full_name || 'Founder'}</span>
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main content area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  )
}

/**
 * Metadata for founder pages
 */
export const metadata = {
  title: {
    template: '%s | Founder Command Center - Project Manthan',
    default: 'Founder Command Center | Project Manthan',
  },
  description: 'Administrative dashboard for managing and reviewing all projects in the Project Manthan marketplace.',
}