/**
 * Creator Layout - Route Protection for Creator-Only Pages
 *
 * This layout component wraps all pages in the (creator) route group and provides
 * server-side authorization before any page content is rendered.
 *
 * Protected routes include:
 * - /dashboard (creator dashboard)
 * - /projects/* (creator project management)
 * - Any other routes placed in the (creator) folder
 *
 * Authorization Logic:
 * 1. Fetch user profile on the server
 * 2. If no authenticated user → redirect to /login
 * 3. If user is not a creator → redirect to /login
 * 4. If authorized → render child pages
 *
 * This approach ensures:
 * - No unauthorized page content is ever rendered
 * - No client-side JavaScript is needed for route protection
 * - Fast server-side redirects before hydration
 * - SEO-friendly (search engines see redirects, not protected content)
 */

import { redirect } from 'next/navigation'
import { getUserProfile } from '@/lib/user-profile'

export default async function CreatorLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Fetch user profile with role information on the server
  const profile = await getUserProfile()

  // Redirect unauthenticated users to login
  if (!profile) {
    redirect('/auth/login')
  }

  // Redirect non-creators to login (founders have their own routes)
  if (profile.role !== 'creator') {
    redirect('/auth/login')
  }

  // If we reach here, user is authenticated and has creator role
  // Render the child pages wrapped in a creator-optimized layout
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Optional: Add creator-specific navigation, sidebar, or header here */}
      <main className="container mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  )
}

/**
 * Metadata for creator pages (optional but recommended for SEO)
 */
export const metadata = {
  title: {
    template: '%s | Project Manthan - Creator Dashboard',
    default: 'Creator Dashboard | Project Manthan',
  },
  description: 'Manage your screenwriting projects and track your submissions on Project Manthan.',
}