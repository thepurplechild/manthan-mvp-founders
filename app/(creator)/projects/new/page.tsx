/**
 * New Project Page - Server Component Wrapper
 *
 * Simple Server Component that renders the client-side project creation form.
 * This page is automatically protected by the (creator) layout, so only
 * authenticated creators can access it.
 */

import Link from 'next/link'
import { ProjectForm } from '@/components/project-form'

/**
 * New Project Page Component
 * Renders the multi-step project creation interface
 */
export default function NewProjectPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Page Header */}
        <div className="mb-8">
          {/* Breadcrumb */}
          <nav className="mb-4">
            <Link
              href="/dashboard"
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors duration-200"
            >
              ← Back to Dashboard
            </Link>
          </nav>

          {/* Page Title */}
          <h1 className="text-3xl font-bold text-gray-900">
            Create New Project
          </h1>
          <p className="mt-2 text-lg text-gray-600">
            Enter your project details and upload your script to get started
          </p>
        </div>

        {/* Project Creation Form */}
        <ProjectForm />
      </div>
    </div>
  )
}

/**
 * Page metadata for SEO and browser tab
 */
export const metadata = {
  title: 'Create New Project | Project Manthan',
  description: 'Create a new screenwriting project and upload your script for AI analysis.',
}