import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

import { loadProjectReviewData } from '@/lib/projects/review-data'

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
          setAll() {
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

    const reviewData = await loadProjectReviewData(supabase, id, user.id)

    if (!reviewData) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      )
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
