import { notFound, redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { Suspense } from 'react'

import ProjectReviewClient from '@/components/founder/ProjectReviewClient'
import { ProjectReviewSkeleton } from '@/components/founder/ProjectReviewSkeleton'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import type { ProjectReviewData } from '@/types/review'
import { loadProjectReviewData } from '@/lib/projects/review-data'

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
        setAll() {
          // read-only within server components
        },
      },
    }
  )

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    redirect('/auth/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'founder') {
    redirect('/dashboard')
  }

  const reviewData = await loadProjectReviewData(supabase, projectId, user.id)
  return reviewData
}

export default async function ProjectReviewPage({
  params,
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
    description: reviewData?.project.description || 'Review project materials and processing status',
  }
}
