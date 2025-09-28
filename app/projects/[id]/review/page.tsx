import { notFound, redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { Suspense } from 'react'

import ProjectReviewClient from '@/components/founder/ProjectReviewClient'
import { ProjectReviewSkeleton } from '@/components/founder/ProjectReviewSkeleton'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'

export interface ProjectReviewData {
  project: {
    id: string
    title: string
    description: string | null
    status: string
    logline: string | null
    synopsis: string | null
    genre: string[] | null
    created_at: string
    updated_at: string
    owner_id: string
    processing_status: string | null
    quality_score: number | null
    last_run_at: string | null
  }
  ingestions: Array<{
    id: string
    status: string
    progress: number
    created_at: string
    updated_at: string
    source_file_url: string
    mime_type: string | null
    error: string | null
  }>
  processing_steps: Array<{
    id: string
    project_id: string
    step: string
    status: string
    started_at: string | null
    finished_at: string | null
    error: any
    retry_count: number
    created_at: string
  }>
  generated_assets: Array<{
    id: string
    project_id: string
    kind: string
    storage_path: string
    bytes: number | null
    sha256: string | null
    created_at: string
  }>
  generated_content: Array<{
    id: string
    project_id: string
    step: string
    payload: any
    created_at: string
  }>
  approval_status: {
    approved: boolean
    approved_at: string | null
    approved_by: string | null
    feedback: any[]
    revision_requests: any[]
  }
}

async function getProjectReviewData(projectId: string): Promise<ProjectReviewData | null> {
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
    redirect('/auth/login')
  }

  // Check if user is a founder
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'founder') {
    redirect('/dashboard')
  }

  // Load project with all related data
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .single()

  if (projectError || !project) {
    return null
  }

  // Load ingestions
  const { data: ingestions } = await supabase
    .from('ingestions')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })

  // Load AI processing steps
  const { data: processing_steps } = await supabase
    .from('ai_processing_status')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })

  // Load generated assets
  const { data: generated_assets } = await supabase
    .from('generated_assets')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })

  // Load generated content
  const { data: generated_content } = await supabase
    .from('generated_content')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })

  // Mock approval status (would be real table in production)
  const approval_status = {
    approved: false,
    approved_at: null,
    approved_by: null,
    feedback: [],
    revision_requests: []
  }

  return {
    project,
    ingestions: ingestions || [],
    processing_steps: processing_steps || [],
    generated_assets: generated_assets || [],
    generated_content: generated_content || [],
    approval_status
  }
}

export default async function ProjectReviewPage({
  params
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const reviewData = await getProjectReviewData(id)

  if (!reviewData) {
    notFound()
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header with Breadcrumbs */}
      <div className="bg-white border-b border-gray-200">
        <div className="container mx-auto px-6 py-4">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/founder">Dashboard</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href="/founder/projects">Projects</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href={`/projects/${id}`}>
                  {reviewData.project.title}
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Review</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-6 py-8">
        <Suspense fallback={<ProjectReviewSkeleton />}>
          <ProjectReviewClient initialData={reviewData} />
        </Suspense>
      </div>
    </div>
  )
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const reviewData = await getProjectReviewData(id)

  return {
    title: reviewData
      ? `Review: ${reviewData.project.title} | Manthan OS`
      : 'Project Review | Manthan OS',
    description: reviewData?.project.description || 'Review project materials and processing status'
  }
}