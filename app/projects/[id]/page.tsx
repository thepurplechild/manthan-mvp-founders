import { notFound, redirect } from 'next/navigation'
import { cookies, headers } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

import { ProjectDashboard } from '@/components/projects/ProjectDashboard'
import type { ProjectOverviewResponse } from '@/types/projects'
import type { Project } from '@/types/database'

export const runtime = 'nodejs'
export const maxDuration = 30

async function fetchInitialOverview(projectId: string): Promise<ProjectOverviewResponse | null> {
  const cookieStore = await cookies()
  const cookieHeader = cookieStore
    .getAll()
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join('; ')

  const headerList = headers()
  const origin = headerList.get('origin') || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

  try {
    const response = await fetch(`${origin}/api/projects/${projectId}`, {
      method: 'GET',
      headers: cookieHeader ? { Cookie: cookieHeader } : undefined,
      cache: 'no-store',
    })

    if (!response.ok) {
      return null
    }

    const data = (await response.json()) as ProjectOverviewResponse
    return data
  } catch (error) {
    console.error('[project-page] failed to load initial overview', error)
    return null
  }
}

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
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
          // read-only in RSC
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

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id, owner_id, title, status')
    .eq('id', id)
    .single<Project>()

  if (projectError || !project) {
    notFound()
  }

  if (project.owner_id !== user.id) {
    notFound()
  }

  const initialOverview = await fetchInitialOverview(id)

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-6 py-10">
        <ProjectDashboard
          projectId={id}
          initialOverview={initialOverview}
          fallbackTitle={project.title}
        />
      </div>
    </div>
  )
}
