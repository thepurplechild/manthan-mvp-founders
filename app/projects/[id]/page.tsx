import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Upload, FileText, Calendar, User } from 'lucide-react'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

interface Project {
  id: string
  title: string
  status: string
  logline: string | null
  synopsis: string | null
  genre: string[] | null
  created_at: string
  owner_id: string
}

interface Ingestion {
  id: string
  status: string
  progress: number
  created_at: string
  source_file_url: string
}

async function getProject(projectId: string): Promise<{ project: Project | null, ingestions: Ingestion[] }> {
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

  // Load project
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .single()

  if (projectError || !project) {
    return { project: null, ingestions: [] }
  }

  // Check ownership
  if (project.owner_id !== user.id) {
    return { project: null, ingestions: [] }
  }

  // Load ingestions for this project
  const { data: ingestionsData } = await supabase
    .from('ingestions')
    .select('id, status, progress, created_at, source_file_url')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })

  const ingestions = ingestionsData || []

  return { project, ingestions }
}

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { project, ingestions } = await getProject(id)

  if (!project) {
    notFound()
  }

  return (
    <div className="min-h-screen gradient-indian-bg">
      <div className="container mx-auto px-6 py-12">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="flex items-center gap-4 mb-8">
            <Link
              href="/projects"
              className="btn-outline-indian inline-flex items-center gap-2 px-4 py-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Projects
            </Link>
          </div>

          {/* Project Info */}
          <div className="card-indian p-8 mb-8">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h1 className="text-3xl font-heading font-bold text-manthan-charcoal-800 mb-2">
                  {project.title}
                </h1>
                <div className="flex items-center gap-4 text-sm text-manthan-charcoal-600">
                  <div className="flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    Created {new Date(project.created_at).toLocaleDateString()}
                  </div>
                  <div className="flex items-center gap-1">
                    <span className={`inline-block w-2 h-2 rounded-full ${
                      project.status === 'active' ? 'bg-manthan-mint-500' :
                      project.status === 'completed' ? 'bg-manthan-saffron-500' :
                      'bg-manthan-charcoal-400'
                    }`}></span>
                    Status: {project.status}
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="flex gap-3">
                <Link
                  href={`/projects/${project.id}/upload`}
                  className="btn-indian flex items-center gap-2 px-6 py-3"
                >
                  <Upload className="w-4 h-4" />
                  Upload Script
                </Link>
              </div>
            </div>

            {/* Project Details */}
            {project.logline && (
              <div className="mb-4">
                <h3 className="font-semibold text-manthan-charcoal-800 mb-2">Logline</h3>
                <p className="text-manthan-charcoal-700">{project.logline}</p>
              </div>
            )}

            {project.synopsis && (
              <div className="mb-4">
                <h3 className="font-semibold text-manthan-charcoal-800 mb-2">Synopsis</h3>
                <p className="text-manthan-charcoal-700">{project.synopsis}</p>
              </div>
            )}

            {project.genre && project.genre.length > 0 && (
              <div className="mb-4">
                <h3 className="font-semibold text-manthan-charcoal-800 mb-2">Genres</h3>
                <div className="flex flex-wrap gap-2">
                  {project.genre.map((genre, index) => (
                    <span
                      key={index}
                      className="px-3 py-1 bg-manthan-saffron-100 text-manthan-saffron-800 rounded-full text-sm"
                    >
                      {genre}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Script Uploads */}
          <div className="card-indian p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-heading font-bold text-manthan-charcoal-800">
                Script Uploads
              </h2>
              <Link
                href={`/projects/${project.id}/upload`}
                className="btn-outline-indian flex items-center gap-2"
              >
                <Upload className="w-4 h-4" />
                Upload New Script
              </Link>
            </div>

            {ingestions.length === 0 ? (
              <div className="text-center py-12">
                <div className="bg-manthan-saffron-100 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <FileText className="w-8 h-8 text-manthan-saffron-600" />
                </div>
                <h3 className="text-xl font-semibold text-manthan-charcoal-800 mb-2">
                  No Scripts Uploaded
                </h3>
                <p className="text-manthan-charcoal-600 mb-6">
                  Upload your first script to start the AI processing pipeline
                </p>
                <Link
                  href={`/projects/${project.id}/upload`}
                  className="btn-indian inline-flex items-center gap-2"
                >
                  <Upload className="w-4 h-4" />
                  Upload Your Script
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {ingestions.map((ingestion) => (
                  <div
                    key={ingestion.id}
                    className="border border-manthan-saffron-200 rounded-xl p-4 hover:border-manthan-saffron-300 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-semibold text-manthan-charcoal-800 mb-1">
                          {ingestion.source_file_url.split('/').pop() || 'Script File'}
                        </h4>
                        <div className="flex items-center gap-4 text-sm text-manthan-charcoal-600">
                          <span>Uploaded {new Date(ingestion.created_at).toLocaleDateString()}</span>
                          <span className={`inline-flex items-center gap-1 ${
                            ingestion.status === 'succeeded' ? 'text-manthan-mint-600' :
                            ingestion.status === 'failed' ? 'text-manthan-coral-600' :
                            ingestion.status === 'running' ? 'text-manthan-saffron-600' :
                            'text-manthan-charcoal-500'
                          }`}>
                            <span className={`inline-block w-2 h-2 rounded-full ${
                              ingestion.status === 'succeeded' ? 'bg-manthan-mint-500' :
                              ingestion.status === 'failed' ? 'bg-manthan-coral-500' :
                              ingestion.status === 'running' ? 'bg-manthan-saffron-500' :
                              'bg-manthan-charcoal-400'
                            }`}></span>
                            {ingestion.status} ({ingestion.progress}%)
                          </span>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        {ingestion.status === 'succeeded' && (
                          <Link
                            href={`/projects/${project.id}/results?ingestionId=${ingestion.id}` as any}
                            className="btn-outline-indian text-sm px-4 py-2"
                          >
                            View Results
                          </Link>
                        )}
                        {ingestion.status === 'failed' && (
                          <Link
                            href={`/projects/${project.id}/upload`}
                            className="btn-indian text-sm px-4 py-2"
                          >
                            Try Again
                          </Link>
                        )}
                        {(ingestion.status === 'queued' || ingestion.status === 'running') && (
                          <div className="flex items-center gap-2 text-sm text-manthan-charcoal-600">
                            <div className="w-4 h-4 border-2 border-manthan-saffron-200 border-t-manthan-saffron-500 rounded-full animate-spin"></div>
                            Processing...
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Progress Bar */}
                    {(ingestion.status === 'queued' || ingestion.status === 'running') && (
                      <div className="mt-3">
                        <div className="w-full bg-manthan-saffron-100 h-2 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-manthan-saffron-500 to-manthan-gold-500 rounded-full transition-all duration-500"
                            style={{ width: `${Math.max(ingestion.progress, 10)}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}