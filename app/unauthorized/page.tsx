/**
 * Unauthorized Access Page
 *
 * This page is shown when authenticated users try to access routes
 * they don't have permission for (e.g., creators trying to access founder routes).
 */

import Link from 'next/link'
import { getUserProfile } from '@/lib/user-profile'
import { redirect } from 'next/navigation'

export default async function UnauthorizedPage() {
  // Get user profile to determine where to redirect them
  const profile = await getUserProfile()

  // If not authenticated at all, redirect to login
  if (!profile) {
    redirect('/auth/login')
  }

  // Determine the appropriate dashboard based on role
  const dashboardUrl = profile.role === 'founder' ? '/founder/dashboard' : '/dashboard'

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <div className="text-center">
            <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
              Access Denied
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              You don't have permission to access this page.
            </p>
            <p className="mt-4 text-sm text-gray-500">
              Logged in as: <span className="font-medium">{profile.full_name || 'User'}</span>
              <br />
              Role: <span className="font-medium capitalize">{profile.role}</span>
            </p>
          </div>

          <div className="mt-6">
            <Link
              href={dashboardUrl}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Go to Your Dashboard
            </Link>
          </div>

          <div className="mt-4 text-center">
            <Link
              href="/auth/login"
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Sign out
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export const metadata = {
  title: 'Unauthorized | Project Manthan',
  description: 'You do not have permission to access this page.',
}