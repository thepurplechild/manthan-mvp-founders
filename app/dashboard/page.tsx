import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from 'next/link'
import { Plus, FileText, Clock, CheckCircle, BarChart3, Upload, Eye, Download, Sparkles, Newspaper, TrendingUp, Building2 } from 'lucide-react'

export default async function Dashboard() {
  const supabase = await createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect('/auth/login');
  }

  // Get user profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  // Get user's projects
  const { data: projects } = await supabase
    .from('projects')
    .select(`
      *,
      script_uploads (*),
      generated_assets (*)
    `)
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false })

  // Recent activity (uploads/assets)
  interface ProjectWithUploadsAndAssets {
    id: string;
    title: string;
    script_uploads?: Array<{ uploaded_at: string; file_name?: string }>;
    generated_assets?: Array<{ created_at: string; asset_type: string }>;
    genre?: string[];
  }
  
  const recentUploads = (projects || [])
    .flatMap((p: ProjectWithUploadsAndAssets) => (p.script_uploads || []).map((u) => ({
      type: 'upload' as const,
      projectId: p.id,
      projectTitle: p.title,
      at: u.uploaded_at,
      label: u.file_name || 'Script upload'
    })))
  const recentAssets = (projects || [])
    .flatMap((p: ProjectWithUploadsAndAssets) => (p.generated_assets || []).map((a) => ({
      type: 'asset' as const,
      projectId: p.id,
      projectTitle: p.title,
      at: a.created_at,
      label: a.asset_type
    })))
  const recentActivity = [...recentUploads, ...recentAssets]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 5)

  // Market trends from your genres
  const genreCounts: Record<string, number> = {}
  for (const p of projects || []) {
    const project = p as ProjectWithUploadsAndAssets;
    if (Array.isArray(project.genre)) {
      for (const g of project.genre) {
        if (!g) continue
        genreCounts[g] = (genreCounts[g] || 0) + 1
      }
    }
  }
  const topGenres = Object.entries(genreCounts).sort((a, b) => b[1] - a[1]).slice(0, 5)

  // Mock market trends data (replace with actual data source later)
  const trends = [
    { region: 'Mumbai', trending_genres: ['Crime Thriller', 'Family Drama'] },
    { region: 'Delhi NCR', trending_genres: ['Web Series', 'Comedy'] },
    { region: 'Bangalore', trending_genres: ['Tech Drama', 'Romance'] }
  ]

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return 'bg-manthan-charcoal-100 text-manthan-charcoal-600 border-manthan-charcoal-200'
      case 'submitted': return 'bg-manthan-royal-100 text-manthan-royal-700 border-manthan-royal-200'
      case 'in_review': return 'bg-manthan-gold-100 text-manthan-gold-700 border-manthan-gold-200'
      case 'active': return 'bg-manthan-mint-100 text-manthan-mint-700 border-manthan-mint-200'
      default: return 'bg-manthan-charcoal-100 text-manthan-charcoal-600 border-manthan-charcoal-200'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'draft': return <FileText className="w-4 h-4" />
      case 'submitted': return <Upload className="w-4 h-4" />
      case 'in_review': return <Clock className="w-4 h-4" />
      case 'active': return <CheckCircle className="w-4 h-4" />
      default: return <FileText className="w-4 h-4" />
    }
  }

  return (
    <div className="min-h-screen gradient-indian-bg">
      <div className="container mx-auto px-6 py-12">
        {/* Header Section */}
        <div className="mb-12">
          <div className="text-center mb-8">
            <div className="text-manthan-charcoal-600 mb-2">Welcome back,</div>
            <h1 className="text-5xl font-heading font-bold text-manthan-charcoal-800 mb-4">
              <span className="text-gradient-indian">{profile?.full_name || 'Creator'}</span>
            </h1>
            <p className="text-lg text-manthan-charcoal-600 max-w-2xl mx-auto">Manage your projects, track progress, and watch your stories transform into success.</p>
          </div>
          <div className="flex justify-center flex-wrap gap-4">
            <Link href="/projects/new" className="btn-indian flex items-center gap-3">
              <Plus className="w-5 h-5" /> Create New Project
            </Link>
            <Link href="/upload" className="btn-outline-indian flex items-center gap-3">
              <Upload className="w-5 h-5" /> Upload Script
            </Link>
            <Link href="/test-auth" className="text-xs px-3 py-2 bg-manthan-charcoal-600 text-white rounded-lg hover:bg-manthan-charcoal-700 transition-colors flex items-center gap-2">
              🧪 Test Auth
            </Link>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid md:grid-cols-4 gap-6 mb-12">
          <div className="card-indian p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="bg-gradient-to-br from-manthan-saffron-500 to-manthan-gold-500 w-12 h-12 rounded-xl flex items-center justify-center shadow-indian">
                <FileText className="w-6 h-6 text-white" />
              </div>
              <span className="text-3xl font-bold text-manthan-charcoal-800">{projects?.length || 0}</span>
            </div>
            <h3 className="text-manthan-charcoal-600 font-semibold">Total Projects</h3>
          </div>

          <div className="card-indian p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="bg-gradient-to-br from-manthan-royal-500 to-manthan-teal-500 w-12 h-12 rounded-xl flex items-center justify-center shadow-soft">
                <Clock className="w-6 h-6 text-white" />
              </div>
              <span className="text-3xl font-bold text-manthan-charcoal-800">
                {projects?.filter(p => p.status === 'in_review').length || 0}
              </span>
            </div>
            <h3 className="text-manthan-charcoal-600 font-semibold">In Review</h3>
          </div>

          <div className="card-indian p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="bg-gradient-to-br from-manthan-mint-500 to-manthan-teal-400 w-12 h-12 rounded-xl flex items-center justify-center shadow-soft">
                <CheckCircle className="w-6 h-6 text-white" />
              </div>
              <span className="text-3xl font-bold text-manthan-charcoal-800">
                {projects?.filter(p => p.status === 'active').length || 0}
              </span>
            </div>
            <h3 className="text-manthan-charcoal-600 font-semibold">Active</h3>
          </div>

          <div className="card-indian p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="bg-gradient-to-br from-manthan-coral-500 to-manthan-saffron-400 w-12 h-12 rounded-xl flex items-center justify-center shadow-soft">
                <BarChart3 className="w-6 h-6 text-white" />
              </div>
              <span className="text-3xl font-bold text-manthan-charcoal-800">--</span>
            </div>
            <h3 className="text-manthan-charcoal-600 font-semibold">Success Rate</h3>
          </div>
        </div>

        {/* Projects Section */}
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-4xl font-heading font-bold text-manthan-charcoal-800">Your Projects</h2>
          <Link href="/projects/new" className="btn-indian flex items-center gap-3">
            <Plus className="w-5 h-5" />
            New Project
          </Link>
        </div>

        {/* India-focused widgets */}
        <div className="grid lg:grid-cols-3 gap-6 mb-12">
          <div className="card-indian p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-manthan-charcoal-800 font-semibold">
                <TrendingUp className="w-5 h-5" /> Market Trends
              </div>
              <span className="text-manthan-charcoal-600 text-sm">Your genres</span>
            </div>
            {topGenres.length > 0 ? (
              <div className="space-y-3">
                {topGenres.map(([g, c]) => (
                  <div key={g} className="flex items-center justify-between">
                    <span className="text-manthan-charcoal-700">{g}</span>
                    <span className="bg-manthan-saffron-100 text-manthan-saffron-700 px-2 py-1 rounded-full text-sm font-medium">{c}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-manthan-charcoal-600">Add genres to your projects to see trends.</p>
            )}
            {/* Global trends */}
            <div className="mt-4 border-t border-manthan-saffron-200/30 pt-3">
              <p className="text-manthan-charcoal-800 font-semibold mb-2">Regional Insights</p>
              <ul className="space-y-1 text-manthan-charcoal-600 text-sm">
                {(trends || []).map((t: { region: string; trending_genres?: string[] }, idx: number) => (
                  <li key={idx}>• {t.region}: {(t.trending_genres || []).slice(0,3).join(', ')}</li>
                ))}
              </ul>
            </div>
          </div>
          <div className="card-indian p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-manthan-charcoal-800 font-semibold">
                <Building2 className="w-5 h-5" /> Platform Status
              </div>
              <span className="text-manthan-charcoal-600 text-sm">Connect data</span>
            </div>
            <ul className="space-y-2 text-manthan-charcoal-600">
              <li className="flex items-center gap-2"><div className="w-2 h-2 bg-manthan-mint-500 rounded-full"></div>Netflix India — Actively acquiring</li>
              <li className="flex items-center gap-2"><div className="w-2 h-2 bg-manthan-gold-500 rounded-full"></div>Prime Video India — Selective</li>
              <li className="flex items-center gap-2"><div className="w-2 h-2 bg-manthan-mint-500 rounded-full"></div>Disney+ Hotstar — Actively acquiring</li>
              <li className="flex items-center gap-2"><div className="w-2 h-2 bg-manthan-coral-500 rounded-full"></div>Zee5/SonyLIV — Genre dependent</li>
            </ul>
          </div>
          <div className="card-indian p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-manthan-charcoal-800 font-semibold">
                <BarChart3 className="w-5 h-5" /> Revenue Tracker
              </div>
              <span className="text-manthan-charcoal-600 text-sm">Placeholder</span>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <div className="text-2xl font-bold text-manthan-charcoal-800">—</div>
                <div className="text-manthan-charcoal-600 text-sm">Gross</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-manthan-charcoal-800">—</div>
                <div className="text-manthan-charcoal-600 text-sm">Estimates</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-manthan-charcoal-800">—</div>
                <div className="text-manthan-charcoal-600 text-sm">Pipelines</div>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Activity & Community */}
        <div className="grid lg:grid-cols-3 gap-6 mb-12">
          <div className="lg:col-span-2 card-indian p-6">
            <div className="flex items-center gap-2 text-manthan-charcoal-800 font-semibold mb-4">
              <Sparkles className="w-5 h-5" /> Recent Activity
            </div>
            {recentActivity.length > 0 ? (
              <ul className="space-y-3">
                {recentActivity.map((a, idx) => (
                  <li key={idx} className="flex items-center justify-between text-manthan-charcoal-600">
                    <span>
                      {a.type === 'upload' ? 'Upload' : 'Asset'} • {a.label} • <span className="text-manthan-charcoal-800 font-medium">{a.projectTitle}</span>
                    </span>
                    <span className="text-xs text-manthan-charcoal-500">{new Date(a.at).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-manthan-charcoal-600">No recent activity yet.</p>
            )}
          </div>
          <div className="card-indian p-6">
            <div className="flex items-center gap-2 text-manthan-charcoal-800 font-semibold mb-4">
              <Newspaper className="w-5 h-5" /> Community Updates
            </div>
            <ul className="space-y-2 text-manthan-charcoal-600">
              <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 bg-manthan-saffron-500 rounded-full"></div>New OTT pitch windows opening next month</li>
              <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 bg-manthan-royal-500 rounded-full"></div>Genre trends: Crime thrillers, slice-of-life web series</li>
              <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 bg-manthan-teal-500 rounded-full"></div>Connect your industry feed to see more</li>
            </ul>
          </div>
        </div>

        {/* Projects List */}
        <div className="space-y-6">
          {projects && projects.length > 0 ? (
            projects.map((project) => (
              <div key={project.id} className="card-indian p-8 hover:shadow-indian hover:-translate-y-1 transition-all duration-300">
                <div className="flex items-start justify-between mb-6">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <h3 className="text-2xl font-bold text-manthan-charcoal-800">{project.title}</h3>
                      <span className={`px-3 py-1 rounded-full text-sm font-medium border flex items-center gap-2 ${getStatusColor(project.status)}`}>
                        {getStatusIcon(project.status)}
                        {project.status.replace('_', ' ').toUpperCase()}
                      </span>
                    </div>
                    {project.logline && (
                      <p className="text-manthan-charcoal-600 text-lg mb-4">{project.logline}</p>
                    )}
                    <div className="flex items-center space-x-6 text-sm text-manthan-charcoal-600">
                      <span>Created {new Date(project.created_at).toLocaleDateString()}</span>
                      {project.genre && <span>Genre: {Array.isArray(project.genre) ? project.genre.slice(0,2).join(', ') : project.genre}</span>}
                      {project.character_breakdowns?.india_metadata?.languages?.length ? (
                        <span>Lang: {project.character_breakdowns.india_metadata.languages.slice(0,2).join(', ')}</span>
                      ) : null}
                      {project.target_platforms ? (
                        <span>
                          Platforms: {Array.isArray(project.target_platforms)
                            ? project.target_platforms.slice(0, 2).join(', ')
                            : String(project.target_platforms)}
                        </span>
                      ) : null}
                      {project.script_uploads?.length > 0 && (
                        <span className="flex items-center gap-1">
                          <Upload className="w-4 h-4" />
                          Script Uploaded
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <Link
                      href={`/projects/${project.id}`}
                      className="bg-manthan-saffron-100 hover:bg-manthan-saffron-200 p-3 rounded-xl transition-colors border border-manthan-saffron-200"
                      title="View Project"
                    >
                      <Eye className="w-5 h-5 text-manthan-saffron-700" />
                    </Link>
                    {project.generated_assets?.length > 0 && (
                      <button 
                        className="bg-manthan-mint-100 hover:bg-manthan-mint-200 p-3 rounded-xl transition-colors border border-manthan-mint-200"
                        title="Download Assets"
                      >
                        <Download className="w-5 h-5 text-manthan-mint-700" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Progress Indicators */}
                <div className="flex items-center space-x-8">
                  <div className="flex items-center space-x-2">
                    <div className={`w-3 h-3 rounded-full ${project.script_uploads?.length > 0 ? 'bg-manthan-mint-500' : 'bg-manthan-charcoal-300'}`}></div>
                    <span className="text-sm text-manthan-charcoal-600">Script</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className={`w-3 h-3 rounded-full ${project.generated_assets?.length > 0 ? 'bg-manthan-mint-500' : 'bg-manthan-charcoal-300'}`}></div>
                    <span className="text-sm text-manthan-charcoal-600">AI Pitch Deck</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className={`w-3 h-3 rounded-full ${project.status === 'in_review' || project.status === 'active' ? 'bg-manthan-mint-500' : 'bg-manthan-charcoal-300'}`}></div>
                    <span className="text-sm text-manthan-charcoal-600">Expert Review</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className={`w-3 h-3 rounded-full ${project.status === 'active' ? 'bg-manthan-mint-500' : 'bg-manthan-charcoal-300'}`}></div>
                    <span className="text-sm text-manthan-charcoal-600">Live Pitching</span>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-16">
              <div className="card-premium p-12">
                <div className="bg-gradient-to-br from-manthan-saffron-500 to-manthan-gold-500 w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-gold">
                  <FileText className="w-10 h-10 text-white" />
                </div>
                <h3 className="text-3xl font-heading font-bold text-manthan-charcoal-800 mb-4">No Projects Yet</h3>
                <p className="text-manthan-charcoal-600 mb-8 max-w-md mx-auto leading-relaxed">
                  Ready to turn your script into a professional pitch? Create your first project to get started.
                </p>
                <Link href="/projects/new" className="btn-indian text-lg px-8 py-4 inline-flex items-center gap-3">
                  <Plus className="w-5 h-5" />
                  Create Your First Project
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
