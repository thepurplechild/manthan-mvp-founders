import Link from "next/link"
import { redirect } from "next/navigation"
import type { Route } from "next"
import { getServerClient } from "@/lib/supabase/server"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  BarChart3,
  Users,
  FileText,
  TrendingUp,
  Calendar,
  ExternalLink,
  Plus,
  Building2,
  Target,
  Clock
} from "lucide-react"

// Types for our data
interface ProjectWithCreator {
  id: string
  title: string
  status: string
  created_at: string
  owner_id: string
  logline: string | null
  genre: string[] | null
  target_platforms: string[] | null
  profiles: {
    full_name: string
  } | null
}

interface PlatformMandate {
  id: string
  platform_name: string
  mandate_description: string
  tags: string[] | null
  source: string | null
  created_at: string
}

interface DealPipelineEntry {
  id: string
  target_buyer_name: string
  status: string
  feedback_notes: string | null
  updated_at: string
  projects: {
    title: string
  } | null
}

interface DashboardStats {
  totalProjects: number
  projectsInReview: number
  activeDeals: number
  closedDeals: number
}

async function getDashboardData() {
  const supabase = getServerClient()

  // Fetch all projects with creator names
  const { data: projects, error: projectsError } = await supabase
    .from('projects')
    .select(`
      id,
      title,
      status,
      created_at,
      owner_id,
      logline,
      genre,
      target_platforms,
      profiles!projects_owner_id_fkey (
        full_name
      )
    `)
    .order('created_at', { ascending: false })

  if (projectsError) {
    console.error('Error fetching projects:', projectsError)
  }

  // Fetch all platform mandates
  const { data: mandates, error: mandatesError } = await supabase
    .from('platform_mandates')
    .select('*')
    .order('created_at', { ascending: false })

  if (mandatesError) {
    console.error('Error fetching mandates:', mandatesError)
  }

  // Fetch all deal pipeline entries with project titles
  const { data: deals, error: dealsError } = await supabase
    .from('deal_pipeline')
    .select(`
      id,
      target_buyer_name,
      status,
      feedback_notes,
      updated_at,
      projects!deal_pipeline_project_id_fkey (
        title
      )
    `)
    .order('updated_at', { ascending: false })

  if (dealsError) {
    console.error('Error fetching deals:', dealsError)
  }

  // Calculate statistics
  const stats: DashboardStats = {
    totalProjects: projects?.length || 0,
    projectsInReview: projects?.filter(p => p.status === 'review' || p.status === 'in_review').length || 0,
    activeDeals: deals?.filter(d => d.status === 'in_discussion' || d.status === 'introduced').length || 0,
    closedDeals: deals?.filter(d => d.status === 'deal_closed').length || 0,
  }

  // Transform the data to match our interfaces
  const transformedProjects: ProjectWithCreator[] = (projects || []).map(project => ({
    ...project,
    profiles: Array.isArray(project.profiles) ? project.profiles[0] || null : project.profiles
  }))

  const transformedDeals: DealPipelineEntry[] = (deals || []).map(deal => ({
    ...deal,
    projects: Array.isArray(deal.projects) ? deal.projects[0] || null : deal.projects
  }))

  return {
    projects: transformedProjects,
    mandates: (mandates as PlatformMandate[]) || [],
    deals: transformedDeals,
    stats
  }
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

function getStatusBadgeVariant(status: string) {
  switch (status.toLowerCase()) {
    case 'draft':
      return 'secondary'
    case 'review':
    case 'in_review':
      return 'default'
    case 'approved':
    case 'completed':
      return 'default'
    case 'introduced':
      return 'secondary'
    case 'in_discussion':
      return 'default'
    case 'deal_closed':
      return 'default'
    case 'passed':
      return 'secondary'
    default:
      return 'secondary'
  }
}

function getStatusColor(status: string) {
  switch (status.toLowerCase()) {
    case 'draft':
      return 'text-gray-600'
    case 'review':
    case 'in_review':
      return 'text-yellow-600'
    case 'approved':
    case 'completed':
      return 'text-green-600'
    case 'introduced':
      return 'text-blue-600'
    case 'in_discussion':
      return 'text-purple-600'
    case 'deal_closed':
      return 'text-green-600'
    case 'passed':
      return 'text-red-600'
    default:
      return 'text-gray-600'
  }
}

function getProjectUrl(projectId: string): Route {
  return `/founder/projects/${projectId}` as Route
}

export default async function FounderDashboard() {
  const { projects, mandates, deals, stats } = await getDashboardData()

  return (
    <div className="container mx-auto py-8 px-4 space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Founder's Command Center</h1>
          <p className="text-muted-foreground">
            Your central hub for managing the Manthan marketplace
          </p>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Projects</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalProjects}</div>
            <p className="text-xs text-muted-foreground">
              All creator projects in the system
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Projects In Review</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.projectsInReview}</div>
            <p className="text-xs text-muted-foreground">
              Awaiting founder review
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Deals</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.activeDeals}</div>
            <p className="text-xs text-muted-foreground">
              Currently in discussion
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Closed Deals</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.closedDeals}</div>
            <p className="text-xs text-muted-foreground">
              Successfully completed
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="projects" className="space-y-4">
        <TabsList>
          <TabsTrigger value="projects">All Projects</TabsTrigger>
          <TabsTrigger value="mandates">Platform Mandates</TabsTrigger>
          <TabsTrigger value="pipeline">Deal Pipeline</TabsTrigger>
        </TabsList>

        {/* Projects Tab */}
        <TabsContent value="projects" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>All Projects</CardTitle>
              <CardDescription>
                View and manage all creator projects in the marketplace
              </CardDescription>
            </CardHeader>
            <CardContent>
              {projects.length === 0 ? (
                <div className="text-center py-8">
                  <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
                  <h3 className="mt-2 text-sm font-semibold">No projects yet</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Projects will appear here as creators submit them
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Creator</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Genre</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {projects.map((project) => (
                      <TableRow key={project.id}>
                        <TableCell>
                          <div>
                            <Link
                              href={getProjectUrl(project.id)}
                              className="font-medium hover:underline"
                            >
                              {project.title}
                            </Link>
                            {project.logline && (
                              <p className="text-sm text-muted-foreground mt-1">
                                {project.logline.length > 80
                                  ? `${project.logline.substring(0, 80)}...`
                                  : project.logline
                                }
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-muted-foreground" />
                            {project.profiles?.full_name || 'Unknown Creator'}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={getStatusBadgeVariant(project.status)}
                            className={getStatusColor(project.status)}
                          >
                            {project.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {project.genre?.slice(0, 2).map((g, index) => (
                              <Badge key={index} variant="outline" className="text-xs">
                                {g}
                              </Badge>
                            ))}
                            {project.genre && project.genre.length > 2 && (
                              <Badge variant="outline" className="text-xs">
                                +{project.genre.length - 2}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDate(project.created_at)}
                        </TableCell>
                        <TableCell>
                          <Link href={getProjectUrl(project.id)}>
                            <Button variant="ghost" size="sm">
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Platform Mandates Tab */}
        <TabsContent value="mandates" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Platform Mandates</CardTitle>
                  <CardDescription>
                    Market intelligence and platform requirements
                  </CardDescription>
                </div>
                <Link href={"/founder/mandates/new" as Route}>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Create New Mandate
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {mandates.length === 0 ? (
                <div className="text-center py-8">
                  <Building2 className="mx-auto h-12 w-12 text-muted-foreground" />
                  <h3 className="mt-2 text-sm font-semibold">No mandates yet</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Create your first platform mandate to start tracking market intelligence
                  </p>
                  <Link href={"/founder/mandates/new" as Route}>
                    <Button className="mt-4">
                      <Plus className="h-4 w-4 mr-2" />
                      Create New Mandate
                    </Button>
                  </Link>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Platform</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Tags</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mandates.map((mandate) => (
                      <TableRow key={mandate.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{mandate.platform_name}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <p className="text-sm">
                            {mandate.mandate_description.length > 100
                              ? `${mandate.mandate_description.substring(0, 100)}...`
                              : mandate.mandate_description
                            }
                          </p>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {mandate.tags?.slice(0, 3).map((tag, index) => (
                              <Badge key={index} variant="secondary" className="text-xs">
                                {tag}
                              </Badge>
                            ))}
                            {mandate.tags && mandate.tags.length > 3 && (
                              <Badge variant="secondary" className="text-xs">
                                +{mandate.tags.length - 3}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {mandate.source || 'No source'}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDate(mandate.created_at)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Deal Pipeline Tab */}
        <TabsContent value="pipeline" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Deal Pipeline</CardTitle>
              <CardDescription>
                Track all deals and buyer interactions
              </CardDescription>
            </CardHeader>
            <CardContent>
              {deals.length === 0 ? (
                <div className="text-center py-8">
                  <TrendingUp className="mx-auto h-12 w-12 text-muted-foreground" />
                  <h3 className="mt-2 text-sm font-semibold">No deals yet</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Deal pipeline entries will appear here as you engage with buyers
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Project</TableHead>
                      <TableHead>Target Buyer</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead>Last Update</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deals.map((deal) => (
                      <TableRow key={deal.id}>
                        <TableCell>
                          <span className="font-medium">{deal.projects?.title || 'Unknown Project'}</span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                            {deal.target_buyer_name}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={getStatusBadgeVariant(deal.status)}
                            className={getStatusColor(deal.status)}
                          >
                            {deal.status.replace('_', ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <p className="text-sm text-muted-foreground">
                            {deal.feedback_notes
                              ? (deal.feedback_notes.length > 50
                                  ? `${deal.feedback_notes.substring(0, 50)}...`
                                  : deal.feedback_notes
                                )
                              : 'No notes yet'
                            }
                          </p>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDate(deal.updated_at)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}