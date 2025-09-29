import Link from 'next/link'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

type Project = {
  id: string
  title: string | null
  status: string | null
  created_at: string | null
}

type Profile = {
  full_name: string | null
  email: string | null
}

async function createSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    return null
  }

  const cookieStore = await cookies()
  const cookieHeader = cookieStore.getAll().map(({ name, value }) => `${name}=${value}`).join('; ')

  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: true,
    },
    global: {
      headers: cookieHeader ? { Cookie: cookieHeader } : undefined,
    },
  })
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  try {
    return new Intl.DateTimeFormat('en', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value))
  } catch {
    return value
  }
}

function statusBadgeClasses(status: string | null): string {
  const normalized = (status ?? '').toLowerCase()
  switch (normalized) {
    case 'review':
    case 'in_review':
      return 'bg-blue-100 text-blue-700'
    case 'approved':
    case 'completed':
      return 'bg-green-100 text-green-700'
    case 'draft':
      return 'bg-gray-100 text-gray-700'
    case 'rejected':
    case 'failed':
      return 'bg-red-100 text-red-600'
    default:
      return 'bg-slate-100 text-slate-600'
  }
}

export default async function CreatorDashboardPage() {
  const supabase = await createSupabaseClient()

  if (!supabase) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-12">
        <h1 className="text-3xl font-semibold text-foreground">Creator Dashboard</h1>
        <p className="mt-4 text-sm text-muted-foreground">
          Supabase credentials are not configured. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.
        </p>
      </div>
    )
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-12">
        <h1 className="text-3xl font-semibold text-foreground">Creator Dashboard</h1>
        <p className="mt-4 text-sm text-muted-foreground">You need to sign in to view your creator dashboard.</p>
        <Link
          href="/auth/login"
          className="mt-6 inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Go to Login
        </Link>
      </div>
    )
  }

  const { data: profileData } = await supabase
    .from('profiles')
    .select('full_name, email, role')
    .eq('id', user.id)
    .maybeSingle<Profile & { role?: string }>()

  // Check if user is a founder and redirect to founder dashboard
  if (profileData?.role === 'founder') {
    redirect('/founder/dashboard')
  }

  const {
    data: projects,
    error: projectsError,
  } = await supabase
    .from('projects')
    .select('id, title, status, created_at')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false })
    .returns<Project[]>()

  const fullName = profileData?.full_name?.trim()
  const email = profileData?.email ?? user.email
  const welcomeName = fullName || email || 'Creator'

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-foreground">Creator Dashboard</h1>
          <p className="mt-2 text-sm text-muted-foreground">Welcome, {welcomeName}!</p>
        </div>
        <Link
          href="/projects/new"
          className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          Create New Project
        </Link>
      </header>

      <section className="mt-10">
        {projectsError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            We couldn’t load your projects right now. Please try again later.
          </div>
        ) : !projects || projects.length === 0 ? (
          <div className="rounded-lg border border-dashed border-muted-foreground/40 bg-muted/40 p-8 text-center">
            <p className="text-sm text-muted-foreground">
              You haven’t created any projects yet. Get started by creating one!
            </p>
            <Link
              href="/projects/new"
              className="mt-4 inline-flex items-center rounded-md border border-primary px-4 py-2 text-sm font-medium text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              Create New Project
            </Link>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
            <div className="min-w-full overflow-x-auto">
              <table className="min-w-full divide-y divide-border">
                <thead className="bg-muted/60">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Title
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Status
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Created
                    </th>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-card">
                  {projects.map((project) => (
                    <tr key={project.id} className="hover:bg-muted/40">
                      <td className="px-6 py-4 text-sm text-foreground">
                        <span className="line-clamp-1 font-medium">{project.title ?? 'Untitled project'}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClasses(project.status)}`}>
                          {(project.status ?? 'unknown').replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-muted-foreground">
                        {formatDate(project.created_at)}
                      </td>
                      <td className="px-6 py-4 text-right text-sm">
                        <Link
                          href={`/projects/${project.id}`}
                          className="inline-flex items-center rounded-md border border-primary px-3 py-1 text-xs font-medium text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                        >
                          View Project
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
