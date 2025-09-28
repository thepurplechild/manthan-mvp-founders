import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const cookieStore = await cookies()

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            // Server-side: cookies are read-only
          },
        },
      }
    )

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Check if user is a founder
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || profile.role !== 'founder') {
      return NextResponse.json(
        { error: 'Forbidden - Founder access required' },
        { status: 403 }
      )
    }

    // Parse request body
    const body = await request.json()
    const { feedback, approved_at } = body

    // Verify project exists
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, status')
      .eq('id', id)
      .single()

    if (projectError || !project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      )
    }

    // Check if project is ready for approval (processing complete)
    const { data: processing_steps } = await supabase
      .from('ai_processing_status')
      .select('status')
      .eq('project_id', id)

    const hasIncompleteSteps = processing_steps?.some(
      step => step.status === 'pending' || step.status === 'running'
    )
    const hasFailedSteps = processing_steps?.some(step => step.status === 'failed')

    if (hasIncompleteSteps) {
      return NextResponse.json(
        { error: 'Cannot approve project while processing is incomplete' },
        { status: 400 }
      )
    }

    if (hasFailedSteps) {
      return NextResponse.json(
        { error: 'Cannot approve project with failed processing steps' },
        { status: 400 }
      )
    }

    // Update project status to approved
    const { data: updatedProject, error: updateError } = await supabase
      .from('projects')
      .update({
        status: 'approved',
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      return NextResponse.json(
        { error: 'Failed to approve project' },
        { status: 500 }
      )
    }

    // In a real implementation, you would:
    // 1. Store approval in a dedicated approvals table
    // 2. Send notifications to relevant stakeholders
    // 3. Trigger any post-approval workflows
    // 4. Log the approval event

    console.log(`Project ${id} approved by founder ${user.id}`, {
      project_id: id,
      approved_by: user.id,
      approved_at: approved_at || new Date().toISOString(),
      feedback: feedback || null
    })

    return NextResponse.json({
      success: true,
      project: updatedProject,
      approval: {
        approved: true,
        approved_at: approved_at || new Date().toISOString(),
        approved_by: user.id,
        feedback: feedback || null
      }
    })

  } catch (error) {
    console.error('Error approving project:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}