import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const runtime = 'nodejs'
export const maxDuration = 30

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

    // Load project with all related data
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .single()

    if (projectError || !project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      )
    }

    // Load related data in parallel
    const [
      { data: ingestions },
      { data: processing_steps },
      { data: generated_assets },
      { data: generated_content }
    ] = await Promise.all([
      supabase
        .from('ingestions')
        .select('*')
        .eq('project_id', id)
        .order('created_at', { ascending: false }),

      supabase
        .from('ai_processing_status')
        .select('*')
        .eq('project_id', id)
        .order('created_at', { ascending: true }),

      supabase
        .from('generated_assets')
        .select('*')
        .eq('project_id', id)
        .order('created_at', { ascending: false }),

      supabase
        .from('generated_content')
        .select('*')
        .eq('project_id', id)
        .order('created_at', { ascending: false })
    ])

    // Mock approval status (would be real table in production)
    const approval_status = {
      approved: project.status === 'approved',
      approved_at: project.status === 'approved' ? project.updated_at : null,
      approved_by: project.status === 'approved' ? 'System' : null,
      feedback: [],
      revision_requests: []
    }

    const reviewData = {
      project,
      ingestions: ingestions || [],
      processing_steps: processing_steps || [],
      generated_assets: generated_assets || [],
      generated_content: generated_content || [],
      approval_status
    }

    return NextResponse.json(reviewData)

  } catch (error) {
    console.error('Error fetching project review data:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}