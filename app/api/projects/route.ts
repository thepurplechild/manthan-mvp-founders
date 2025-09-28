import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const runtime = 'nodejs'
export const maxDuration = 30

// GET /api/projects - List projects for authenticated user
export async function GET(request: NextRequest) {
  try {
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

    // Get URL search parameters for filtering and pagination
    const url = new URL(request.url)
    const limit = parseInt(url.searchParams.get('limit') || '50')
    const offset = parseInt(url.searchParams.get('offset') || '0')
    const status = url.searchParams.get('status')
    const sortBy = url.searchParams.get('sortBy') || 'created_at'
    const sortOrder = url.searchParams.get('sortOrder') || 'desc'

    // Build query
    let query = supabase
      .from('projects')
      .select(`
        *,
        script_uploads (
          id,
          file_name,
          uploaded_at,
          file_size
        ),
        generated_assets (
          id,
          asset_type,
          created_at
        )
      `)
      .eq('owner_id', user.id)
      .order(sortBy, { ascending: sortOrder === 'asc' })
      .range(offset, offset + limit - 1)

    // Apply status filter if provided
    if (status) {
      query = query.eq('status', status)
    }

    const { data: projects, error: projectsError } = await query

    if (projectsError) {
      console.error('Error fetching projects:', projectsError)
      return NextResponse.json(
        { error: 'Failed to fetch projects' },
        { status: 500 }
      )
    }

    // Get total count for pagination
    let countQuery = supabase
      .from('projects')
      .select('*', { count: 'exact', head: true })
      .eq('owner_id', user.id)

    if (status) {
      countQuery = countQuery.eq('status', status)
    }

    const { count, error: countError } = await countQuery

    if (countError) {
      console.error('Error getting project count:', countError)
      // Don't fail the request for count error, just return without pagination info
    }

    // Calculate project statistics
    const stats = {
      total: count || projects?.length || 0,
      draft: projects?.filter(p => p.status === 'draft').length || 0,
      submitted: projects?.filter(p => p.status === 'submitted').length || 0,
      in_review: projects?.filter(p => p.status === 'in_review').length || 0,
      active: projects?.filter(p => p.status === 'active').length || 0,
      with_scripts: projects?.filter(p => p.script_uploads && p.script_uploads.length > 0).length || 0,
      with_assets: projects?.filter(p => p.generated_assets && p.generated_assets.length > 0).length || 0,
    }

    return NextResponse.json({
      projects: projects || [],
      stats,
      pagination: {
        limit,
        offset,
        total: count || 0,
        hasMore: count ? offset + limit < count : false
      }
    })

  } catch (error) {
    console.error('Error in GET /api/projects:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST /api/projects - Create a new project
export async function POST(request: NextRequest) {
  try {
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

    // Parse request body
    const body = await request.json()
    const {
      title,
      logline,
      synopsis,
      genre,
      budget_range,
      target_platforms,
      character_breakdowns,
      status = 'draft'
    } = body

    // Validate required fields
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return NextResponse.json(
        { error: 'Project title is required' },
        { status: 400 }
      )
    }

    // Validate optional arrays
    if (genre && !Array.isArray(genre)) {
      return NextResponse.json(
        { error: 'Genre must be an array' },
        { status: 400 }
      )
    }

    if (target_platforms && !Array.isArray(target_platforms)) {
      return NextResponse.json(
        { error: 'Target platforms must be an array' },
        { status: 400 }
      )
    }

    // Create project
    const { data: project, error: createError } = await supabase
      .from('projects')
      .insert({
        owner_id: user.id,
        title: title.trim(),
        logline: logline?.trim() || null,
        synopsis: synopsis?.trim() || null,
        genre: genre || [],
        budget_range: budget_range || null,
        target_platforms: target_platforms || [],
        character_breakdowns: character_breakdowns || null,
        status: status
      })
      .select(`
        *,
        script_uploads (
          id,
          file_name,
          uploaded_at,
          file_size
        ),
        generated_assets (
          id,
          asset_type,
          created_at
        )
      `)
      .single()

    if (createError) {
      console.error('Error creating project:', createError)
      return NextResponse.json(
        { error: 'Failed to create project' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      project,
      message: 'Project created successfully'
    }, { status: 201 })

  } catch (error) {
    console.error('Error in POST /api/projects:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}