/**
 * Founder Dashboard Page - Command Center Overview
 *
 * Comprehensive administrative dashboard that displays all projects in the system
 * with their associated creator information. Uses advanced Supabase queries with
 * table joins to fetch related data efficiently.
 *
 * Features:
 * - Server-side data fetching with database joins
 * - Project statistics and status breakdown
 * - Comprehensive project table with creator information
 * - Status badges and date formatting
 * - Responsive design for all screen sizes
 * - Links to detailed project review pages
 */

import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'

/**
 * Type definition for project data with creator information
 * Includes nested creator object from profiles table join
 */
interface ProjectWithCreator {
  id: string
  title: string
  status: string
  created_at: string
  creator: {
    full_name: string | null
  } | null
}

/**
 * Type definition for project statistics
 */
interface ProjectStats {
  total: number
  draft: number
  submitted: number
  in_review: number
  active: number
}

/**
 * Helper function to generate appropriate status badge styling
 * Returns Tailwind classes based on project status
 */
function getStatusBadge(status: string) {
  const baseClasses = 'px-2 inline-flex text-xs leading-5 font-semibold rounded-full'

  switch (status.toLowerCase()) {
    case 'draft':
      return `${baseClasses} bg-gray-100 text-gray-800`
    case 'submitted':
      return `${baseClasses} bg-yellow-100 text-yellow-800`
    case 'in_review':
      return `${baseClasses} bg-blue-100 text-blue-800`
    case 'active':
      return `${baseClasses} bg-green-100 text-green-800`
    case 'rejected':
      return `${baseClasses} bg-red-100 text-red-800`
    case 'completed':
      return `${baseClasses} bg-purple-100 text-purple-800`
    default:
      return `${baseClasses} bg-gray-100 text-gray-800`
  }
}

/**
 * Helper function to format status text for display
 * Converts status codes to human-readable format
 */
function formatStatusText(status: string): string {
  return status.replace('_', ' ').toUpperCase()
}

/**
 * Helper function to format creation date in user-friendly format
 */
function formatCreatedDate(dateString: string): string {
  try {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch (error) {
    console.error('Error formatting date:', error)
    return 'Invalid date'
  }
}

/**
 * Helper function to calculate project statistics
 * Aggregates project counts by status
 */
function calculateProjectStats(projects: ProjectWithCreator[]): ProjectStats {
  return {
    total: projects.length,
    draft: projects.filter(p => p.status === 'draft').length,
    submitted: projects.filter(p => p.status === 'submitted').length,
    in_review: projects.filter(p => p.status === 'in_review').length,
    active: projects.filter(p => p.status === 'active').length,
  }
}

/**
 * Statistics Card Component
 * Displays individual stat with label and count
 */
function StatCard({ label, count, bgColor = 'bg-white' }: { label: string; count: number; bgColor?: string }) {
  return (
    <div className={`${bgColor} rounded-lg shadow-sm border border-gray-200 p-6`}>
      <div className="text-sm font-medium text-gray-600 mb-1">{label}</div>
      <div className="text-3xl font-bold text-gray-900">{count}</div>
    </div>
  )
}

/**
 * Founder Dashboard Page Component
 * Server Component that fetches and displays all project data
 */
export default async function FounderDashboardPage() {
  // Create server-side Supabase client
  const supabase = await createClient()

  // Fetch all projects with creator information using table join
  // Uses foreign key relationship: projects.owner_id -> profiles.id
  const { data: projects, error } = await supabase
    .from('projects')
    .select(`
      id,
      title,
      status,
      created_at,
      creator:profiles!owner_id (
        full_name
      )
    `)
    .order('created_at', { ascending: false })

  // Handle query errors gracefully
  if (error) {
    console.error('Error fetching projects:', error)
  }

  // Use empty array as fallback if query failed or returned null
  const projectsList: ProjectWithCreator[] = projects || []

  // Calculate project statistics for dashboard overview
  const stats = calculateProjectStats(projectsList)

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">
          Dashboard Overview
        </h1>
        <p className="mt-2 text-lg text-gray-600">
          Manage and review all projects in the system
        </p>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        <StatCard label="Total Projects" count={stats.total} bgColor="bg-blue-50" />
        <StatCard label="Draft" count={stats.draft} />
        <StatCard label="Submitted" count={stats.submitted} bgColor="bg-yellow-50" />
        <StatCard label="In Review" count={stats.in_review} bgColor="bg-blue-50" />
        <StatCard label="Active" count={stats.active} bgColor="bg-green-50" />
      </div>

      {/* Error Message (if query failed) */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">
                Error Loading Projects
              </h3>
              <div className="mt-2 text-sm text-red-700">
                <p>There was an error loading project data. Please refresh the page or contact support if the issue persists.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Projects Table */}
      <div className="bg-white shadow-md rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">All Projects</h2>
          <p className="text-sm text-gray-600">
            Click on any project title to open the detailed review interface
          </p>
        </div>

        {projectsList.length === 0 ? (
          // Empty state when no projects exist
          <div className="px-6 py-12 text-center">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h3 className="mt-4 text-lg font-medium text-gray-900">No projects in the system</h3>
            <p className="mt-2 text-sm text-gray-600">
              Projects will appear here once creators start uploading their work.
            </p>
          </div>
        ) : (
          // Projects table with responsive overflow
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              {/* Table Header */}
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Project Title
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Creator
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Created
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>

              {/* Table Body */}
              <tbody className="bg-white divide-y divide-gray-200">
                {projectsList.map((project) => (
                  <tr key={project.id} className="hover:bg-gray-50 transition-colors duration-150">
                    {/* Project Title Column */}
                    <td className="px-6 py-4">
                      <Link
                        href={`/founder/projects/${project.id}`}
                        className="text-blue-600 hover:text-blue-800 font-medium transition-colors duration-150 hover:underline"
                      >
                        {project.title || 'Untitled Project'}
                      </Link>
                    </td>

                    {/* Creator Name Column */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {project.creator?.full_name || 'Unknown Creator'}
                      </div>
                    </td>

                    {/* Status Badge Column */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={getStatusBadge(project.status)}>
                        {formatStatusText(project.status)}
                      </span>
                    </td>

                    {/* Created Date Column */}
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatCreatedDate(project.created_at)}
                    </td>

                    {/* Actions Column */}
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <Link
                        href={`/founder/projects/${project.id}`}
                        className="text-blue-600 hover:text-blue-800 font-medium transition-colors duration-150"
                      >
                        Review →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Quick Actions Section (Optional Enhancement) */}
      <div className="bg-white shadow-sm rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-center justify-center px-4 py-3 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-gray-50 cursor-not-allowed">
            📊 View Analytics (Coming Soon)
          </div>
          <div className="flex items-center justify-center px-4 py-3 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-gray-50 cursor-not-allowed">
            ⚙️ Platform Settings (Coming Soon)
          </div>
          <div className="flex items-center justify-center px-4 py-3 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-gray-50 cursor-not-allowed">
            📥 Export Data (Coming Soon)
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Page metadata for SEO and browser tab
 */
export const metadata = {
  title: 'Dashboard | Founder Command Center',
  description: 'Administrative dashboard for managing and reviewing all projects in the Project Manthan marketplace.',
}