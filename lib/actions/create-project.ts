/**
 * Server Action for Creating New Projects
 *
 * This file contains the server action for creating new projects.
 * It's separated from the client component to follow Next.js best practices.
 */

'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

/**
 * Type definition for server action result
 */
export type ActionResult =
  | { success: true; projectId: string }
  | { success: false; error: string }

/**
 * Server Action for creating a new project
 * Handles database insertion and validation
 */
export async function createProject(formData: FormData): Promise<ActionResult> {
  try {
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
      } as any)
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

    return { success: true, projectId: (project as any).id }

  } catch (error) {
    console.error('Unexpected error in createProject:', error)
    return { success: false, error: 'An unexpected error occurred. Please try again.' }
  }
}