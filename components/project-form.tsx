/**
 * Project Form Component - Multi-Step Project Creation
 *
 * Client Component that manages the two-step project creation flow:
 * 1. Metadata Collection: Title and logline input with Server Action submission
 * 2. File Upload: Script upload with progress tracking and signed URLs
 *
 * Features:
 * - Server Action integration for database operations
 * - Client-side state management for multi-step flow
 * - Real-time form validation and error handling
 * - Seamless transition between steps
 */

'use client'

import { useState } from 'react'
import { FileUploader } from '@/components/file-uploader'

/**
 * Type definitions for form state management
 */
type Step = 'metadata' | 'upload'

type ActionResult =
  | { success: true; projectId: string }
  | { success: false; error: string }

/**
 * Server Action for creating a new project
 * Handles database insertion and validation
 */
async function createProject(formData: FormData): Promise<ActionResult> {
  'use server'

  try {
    const { createClient } = await import('@/utils/supabase/server')
    const { revalidatePath } = await import('next/cache')

    // Extract and validate form data
    const title = formData.get('title') as string
    const logline = formData.get('logline') as string

    if (!title || !title.trim()) {
      return { success: false, error: 'Project title is required' }
    }

    if (!logline || !logline.trim()) {
      return { success: false, error: 'Project logline is required' }
    }

    if (title.length > 200) {
      return { success: false, error: 'Project title must be less than 200 characters' }
    }

    if (logline.length > 1000) {
      return { success: false, error: 'Project logline must be less than 1000 characters' }
    }

    // Create server-side Supabase client
    const supabase = await createClient()

    // Get the current authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return { success: false, error: 'Authentication required. Please log in again.' }
    }

    // Insert new project into the database
    const { data: project, error: insertError } = await supabase
      .from('projects')
      .insert({
        owner_id: user.id,
        title: title.trim(),
        logline: logline.trim(),
        status: 'draft'
      })
      .select('id')
      .single()

    if (insertError) {
      console.error('Database insert error:', insertError)
      return { success: false, error: 'Failed to create project. Please try again.' }
    }

    if (!project) {
      return { success: false, error: 'Failed to create project. Please try again.' }
    }

    // Revalidate dashboard cache to show new project
    revalidatePath('/dashboard')

    return { success: true, projectId: project.id }

  } catch (error) {
    console.error('Unexpected error in createProject:', error)
    return { success: false, error: 'An unexpected error occurred. Please try again.' }
  }
}

/**
 * Project Form Component
 * Manages multi-step project creation flow with state management
 */
export function ProjectForm() {
  // Form data state
  const [formData, setFormData] = useState({
    title: '',
    logline: ''
  })

  // Step management
  const [currentStep, setCurrentStep] = useState<Step>('metadata')

  // Project ID state (received after successful project creation)
  const [projectId, setProjectId] = useState<string | null>(null)

  // Loading state for Server Action
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Error state
  const [error, setError] = useState<string | null>(null)

  /**
   * Handle form input changes
   */
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
    // Clear error when user starts typing
    if (error) setError(null)
  }

  /**
   * Handle metadata form submission
   * Calls Server Action to create project in database
   */
  const handleMetadataSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)

    try {
      // Prepare FormData for Server Action
      const formDataObj = new FormData()
      formDataObj.append('title', formData.title)
      formDataObj.append('logline', formData.logline)

      // Call Server Action
      const result = await createProject(formDataObj)

      if (result.success) {
        // Success: Move to upload step
        setProjectId(result.projectId)
        setCurrentStep('upload')
      } else {
        // Error: Show error message
        setError(result.error)
      }
    } catch (err) {
      console.error('Form submission error:', err)
      setError('An unexpected error occurred. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="bg-white shadow-md rounded-lg p-6 md:p-8">
      {currentStep === 'metadata' ? (
        // Step 1: Metadata Collection Form
        <div>
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Project Details
            </h2>
            <p className="text-gray-600">
              Start by entering basic information about your project
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm">{error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Metadata Form */}
          <form onSubmit={handleMetadataSubmit}>
            {/* Project Title */}
            <div className="mb-6">
              <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-2">
                Project Title *
              </label>
              <input
                type="text"
                id="title"
                name="title"
                value={formData.title}
                onChange={handleInputChange}
                placeholder="Enter your project title"
                required
                disabled={isSubmitting}
                className="border border-gray-300 rounded-md px-3 py-2 w-full focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed transition-colors duration-200"
                maxLength={200}
              />
              <p className="mt-1 text-sm text-gray-500">
                {formData.title.length}/200 characters
              </p>
            </div>

            {/* Project Logline */}
            <div className="mb-8">
              <label htmlFor="logline" className="block text-sm font-medium text-gray-700 mb-2">
                Logline *
              </label>
              <textarea
                id="logline"
                name="logline"
                value={formData.logline}
                onChange={handleInputChange}
                placeholder="Write a brief logline (1-2 sentences describing your story)"
                required
                rows={3}
                disabled={isSubmitting}
                className="border border-gray-300 rounded-md px-3 py-2 w-full focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed transition-colors duration-200 resize-vertical"
                maxLength={1000}
              />
              <p className="mt-1 text-sm text-gray-500">
                {formData.logline.length}/1000 characters
              </p>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting || !formData.title.trim() || !formData.logline.trim()}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 flex items-center justify-center"
            >
              {isSubmitting ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Creating Project...
                </>
              ) : (
                'Create Project'
              )}
            </button>
          </form>
        </div>
      ) : (
        // Step 2: File Upload Interface
        <div>
          {/* Success Message */}
          <div className="mb-6">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-green-800">
                    Project created successfully!
                  </h3>
                  <div className="mt-2 text-sm text-green-700">
                    <p>"{formData.title}" has been created. Now upload your script to begin AI analysis.</p>
                  </div>
                </div>
              </div>
            </div>

            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Upload Your Script
            </h2>
            <p className="text-gray-600">
              Upload your screenplay file (PDF or TXT) to start the AI processing pipeline
            </p>
          </div>

          {/* File Uploader Component */}
          {projectId && (
            <FileUploader projectId={projectId} />
          )}
        </div>
      )}
    </div>
  )
}