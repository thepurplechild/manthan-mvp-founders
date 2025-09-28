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
    const { feedback, rating, submitted_at } = body

    if (!feedback || feedback.trim().length === 0) {
      return NextResponse.json(
        { error: 'Feedback text is required' },
        { status: 400 }
      )
    }

    // Verify project exists
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, title')
      .eq('id', id)
      .single()

    if (projectError || !project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      )
    }

    // In a real implementation, you would store feedback in a dedicated table
    // For now, we'll just log it and return success
    const feedbackData = {
      id: `feedback_${Date.now()}`,
      project_id: id,
      user_id: user.id,
      feedback: feedback.trim(),
      rating: rating || null,
      submitted_at: submitted_at || new Date().toISOString(),
      type: 'founder_review'
    }

    console.log('Feedback submitted:', feedbackData)

    // In production, you would:
    // 1. Store in a feedback/comments table
    // 2. Send notifications to project owner
    // 3. Update project metadata
    // 4. Log the feedback event for audit

    // Mock storing feedback
    // await supabase.from('project_feedback').insert(feedbackData)

    return NextResponse.json({
      success: true,
      feedback: feedbackData,
      message: 'Feedback submitted successfully'
    })

  } catch (error) {
    console.error('Error submitting feedback:', error)
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

    // In a real implementation, fetch feedback from database
    // For now, return mock feedback
    const mockFeedback = [
      {
        id: 'feedback_1',
        project_id: id,
        user_id: 'founder_1',
        feedback: 'Strong character development and compelling narrative structure. The market positioning is well-researched.',
        rating: 4,
        submitted_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        type: 'founder_review',
        author: {
          name: 'John Doe',
          role: 'founder'
        }
      },
      {
        id: 'feedback_2',
        project_id: id,
        user_id: 'founder_2',
        feedback: 'The pitch deck is comprehensive and investor-ready. Minor suggestions for the executive summary formatting.',
        rating: 5,
        submitted_at: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
        type: 'founder_review',
        author: {
          name: 'Jane Smith',
          role: 'founder'
        }
      }
    ]

    return NextResponse.json({
      feedback: mockFeedback,
      total: mockFeedback.length
    })

  } catch (error) {
    console.error('Error fetching feedback:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}