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
    const { feedback, categories, priority, deadline, requested_at } = body

    if (!feedback || feedback.trim().length === 0) {
      return NextResponse.json(
        { error: 'Revision feedback is required' },
        { status: 400 }
      )
    }

    if (!categories || categories.length === 0) {
      return NextResponse.json(
        { error: 'At least one revision category must be selected' },
        { status: 400 }
      )
    }

    // Verify project exists
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, title, owner_id')
      .eq('id', id)
      .single()

    if (projectError || !project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      )
    }

    // Update project status to revision_requested
    const { error: updateError } = await supabase
      .from('projects')
      .update({
        status: 'revision_requested',
        updated_at: new Date().toISOString()
      })
      .eq('id', id)

    if (updateError) {
      console.error('Failed to update project status:', updateError)
      // Continue anyway - revision request is more important than status update
    }

    // Create revision request data
    const revisionRequest = {
      id: `revision_${Date.now()}`,
      project_id: id,
      requested_by: user.id,
      feedback: feedback.trim(),
      categories: categories,
      priority: priority || 'medium',
      deadline: deadline || null,
      requested_at: requested_at || new Date().toISOString(),
      status: 'pending'
    }

    console.log('Revision request created:', revisionRequest)

    // In production, you would:
    // 1. Store in a revision_requests table
    // 2. Send notifications to project owner
    // 3. Create tasks/tickets for each category
    // 4. Set up deadline reminders
    // 5. Log the request for audit

    // Mock storing revision request
    // await supabase.from('revision_requests').insert(revisionRequest)

    // Send notification to project owner (mock)
    console.log(`Sending revision request notification to user ${project.owner_id}`, {
      project_title: project.title,
      categories: categories,
      priority: priority
    })

    return NextResponse.json({
      success: true,
      revision_request: revisionRequest,
      message: 'Revision request submitted successfully'
    })

  } catch (error) {
    console.error('Error submitting revision request:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function GET(
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

    // In a real implementation, fetch revision requests from database
    // For now, return mock data
    const mockRevisionRequests = [
      {
        id: 'revision_1',
        project_id: id,
        requested_by: 'founder_1',
        feedback: 'Please strengthen the character motivations in Act 2 and adjust the market positioning for the 25-35 demographic.',
        categories: ['script', 'market'],
        priority: 'high',
        deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        requested_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'in_progress',
        requester: {
          name: 'John Doe',
          role: 'founder'
        }
      }
    ]

    return NextResponse.json({
      revision_requests: mockRevisionRequests,
      total: mockRevisionRequests.length
    })

  } catch (error) {
    console.error('Error fetching revision requests:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}