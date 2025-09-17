import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Users, 
  FileText, 
  Brain, 
  Target, 
  TrendingUp, 
  Clock,
  CheckCircle,
  Eye,
  Settings
} from "lucide-react";

export default async function FounderDashboard() {
  const supabase = await createClient();
  
  // Check if user is authenticated and has founder role
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    redirect("/auth/login");
  }

  // Get user profile and verify founder role
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "founder") {
    redirect("/dashboard");
  }

  // Get all projects with their related data
  const { data: projects } = await supabase
    .from("projects")
    .select(`
      *,
      profiles!projects_owner_id_fkey (full_name, email),
      script_uploads (id, file_name, uploaded_at),
      generated_assets (id, asset_type, version, created_at)
    `)
    .order("created_at", { ascending: false });

  // Get platform mandates
  const { data: mandates } = await supabase
    .from("platform_mandates")
    .select("*")
    .order("created_at", { ascending: false });

  // Get deal pipeline
  const { data: dealPipeline } = await supabase
    .from("deal_pipeline")
    .select(`
      *,
      projects!deal_pipeline_project_id_fkey (title)
    `)
    .order("updated_at", { ascending: false });

  // Calculate stats
  const totalProjects = projects?.length || 0;
  const activeProjects = projects?.filter(p => p.status === 'active').length || 0;
  const projectsInReview = projects?.filter(p => p.status === 'in_review').length || 0;
  const totalDeals = dealPipeline?.length || 0;
  const closedDeals = dealPipeline?.filter(d => d.status === 'deal_closed').length || 0;

  const getStatusColor = (status: string) => {
    switch (status) {
      case "draft": return "bg-gray-100 text-gray-800";
      case "submitted": return "bg-blue-100 text-blue-800";
      case "in_review": return "bg-yellow-100 text-yellow-800";
      case "active": return "bg-green-100 text-green-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const getDealStatusColor = (status: string) => {
    switch (status) {
      case "introduced": return "bg-blue-100 text-blue-800";
      case "in_discussion": return "bg-yellow-100 text-yellow-800";
      case "deal_closed": return "bg-green-100 text-green-800";
      case "passed": return "bg-red-100 text-red-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Navigation */}
      <nav className="border-b border-white/10 bg-black/20">
        <div className="container mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <h1 className="text-2xl font-bold">
              <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                Manthan
              </span>
            </h1>
            <Badge variant="outline" className="bg-purple-600/20 text-purple-200 border-purple-500">
              <Settings className="w-3 h-3 mr-1" />
              Founder Command Center
            </Badge>
          </div>
          
          <div className="flex items-center space-x-6">
            <div className="text-purple-200">
              Welcome, <span className="text-white font-semibold">{profile?.full_name}</span>
            </div>
            <Link href="/dashboard">
              <Button variant="outline" size="sm">
                Switch to Creator View
              </Button>
            </Link>
            <form action="/auth/signout" method="post">
              <Button variant="outline" type="submit" size="sm">
                Sign Out
              </Button>
            </form>
          </div>
        </div>
      </nav>

      <div className="container mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Command Center</h1>
          <p className="text-purple-200 text-lg">
            Manage all projects, market intelligence, and deal pipelines from your central hub.
          </p>
        </div>

        {/* Key Metrics */}
        <div className="grid md:grid-cols-5 gap-6 mb-8">
          <Card className="bg-white/10 backdrop-blur-lg border-white/20">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <Users className="w-6 h-6 text-purple-400" />
                <span className="text-2xl font-bold text-white">{totalProjects}</span>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-purple-200 font-medium">Total Projects</p>
            </CardContent>
          </Card>

          <Card className="bg-white/10 backdrop-blur-lg border-white/20">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <Clock className="w-6 h-6 text-yellow-400" />
                <span className="text-2xl font-bold text-white">{projectsInReview}</span>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-purple-200 font-medium">In Review</p>
            </CardContent>
          </Card>

          <Card className="bg-white/10 backdrop-blur-lg border-white/20">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CheckCircle className="w-6 h-6 text-green-400" />
                <span className="text-2xl font-bold text-white">{activeProjects}</span>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-purple-200 font-medium">Active Projects</p>
            </CardContent>
          </Card>

          <Card className="bg-white/10 backdrop-blur-lg border-white/20">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <Target className="w-6 h-6 text-blue-400" />
                <span className="text-2xl font-bold text-white">{totalDeals}</span>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-purple-200 font-medium">Total Pitches</p>
            </CardContent>
          </Card>

          <Card className="bg-white/10 backdrop-blur-lg border-white/20">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <TrendingUp className="w-6 h-6 text-green-400" />
                <span className="text-2xl font-bold text-white">{closedDeals}</span>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-purple-200 font-medium">Deals Closed</p>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Tabs */}
        <Tabs defaultValue="projects" className="space-y-6">
          <TabsList className="bg-white/10 border-white/20">
            <TabsTrigger value="projects" className="data-[state=active]:bg-purple-600">
              All Projects
            </TabsTrigger>
            <TabsTrigger value="mandates" className="data-[state=active]:bg-purple-600">
              Market Intelligence
            </TabsTrigger>
            <TabsTrigger value="pipeline" className="data-[state=active]:bg-purple-600">
              Deal Pipeline
            </TabsTrigger>
          </TabsList>

          {/* Projects Tab */}
          <TabsContent value="projects" className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold text-white">All Projects</h2>
              <div className="flex gap-2">
                <Link href="/founder/mandates/new">
                  <Button variant="outline" size="sm">
                    <Brain className="w-4 h-4 mr-2" />
                    Add Market Intel
                  </Button>
                </Link>
              </div>
            </div>

            <div className="grid gap-4">
              {projects && projects.length > 0 ? (
                projects.map((project) => (
                  <Card key={project.id} className="bg-white/10 backdrop-blur-lg border-white/20 hover:bg-white/15 transition-all">
                    <CardHeader>
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <CardTitle className="text-white">{project.title}</CardTitle>
                            <Badge className={getStatusColor(project.status)}>
                              {project.status.replace('_', ' ').toUpperCase()}
                            </Badge>
                          </div>
                          <CardDescription className="text-purple-200">
                            Creator: {project.profiles?.full_name} ({project.profiles?.email})
                          </CardDescription>
                          {project.logline && (
                            <p className="text-purple-300 mt-2">{project.logline}</p>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Link href={`/founder/projects/${project.id}`}>
                            <Button variant="outline" size="sm">
                              <Eye className="w-4 h-4 mr-2" />
                              Review
                            </Button>
                          </Link>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex justify-between items-center text-sm text-purple-300">
                        <div className="flex gap-4">
                          <span>Scripts: {project.script_uploads?.length || 0}</span>
                          <span>Assets: {project.generated_assets?.length || 0}</span>
                          {project.genre && <span>Genre: {project.genre.slice(0, 2).join(', ')}</span>}
                        </div>
                        <span>Created {new Date(project.created_at).toLocaleDateString()}</span>
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <Card className="bg-white/10 backdrop-blur-lg border-white/20 text-center p-12">
                  <FileText className="w-12 h-12 text-purple-400 mx-auto mb-4" />
                  <CardTitle className="text-white mb-2">No Projects Yet</CardTitle>
                  <CardDescription className="text-purple-200">
                    Projects created by creators will appear here for your review and management.
                  </CardDescription>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* Market Intelligence Tab */}
          <TabsContent value="mandates" className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold text-white">Market Intelligence</h2>
              <Link href="/founder/mandates/new">
                <Button>
                  <Brain className="w-4 h-4 mr-2" />
                  Add New Intel
                </Button>
              </Link>
            </div>

            <div className="grid gap-4">
              {mandates && mandates.length > 0 ? (
                mandates.map((mandate) => (
                  <Card key={mandate.id} className="bg-white/10 backdrop-blur-lg border-white/20">
                    <CardHeader>
                      <div className="flex justify-between items-start">
                        <div>
                          <CardTitle className="text-white">{mandate.platform_name}</CardTitle>
                          <CardDescription className="text-purple-200">
                            Source: {mandate.source}
                          </CardDescription>
                        </div>
                        <span className="text-sm text-purple-300">
                          {new Date(mandate.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-purple-100 mb-3">{mandate.mandate_description}</p>
                      {mandate.tags && mandate.tags.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {mandate.tags.map((tag: string, index: number) => (
                            <Badge key={index} variant="secondary" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))
              ) : (
                <Card className="bg-white/10 backdrop-blur-lg border-white/20 text-center p-12">
                  <Brain className="w-12 h-12 text-purple-400 mx-auto mb-4" />
                  <CardTitle className="text-white mb-2">No Market Intelligence Yet</CardTitle>
                  <CardDescription className="text-purple-200 mb-4">
                    Start logging platform mandates and market insights to build your competitive advantage.
                  </CardDescription>
                  <Link href="/founder/mandates/new">
                    <Button>Add First Intel</Button>
                  </Link>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* Deal Pipeline Tab */}
          <TabsContent value="pipeline" className="space-y-4">
            <h2 className="text-2xl font-bold text-white">Deal Pipeline</h2>

            <div className="grid gap-4">
              {dealPipeline && dealPipeline.length > 0 ? (
                dealPipeline.map((deal) => (
                  <Card key={deal.id} className="bg-white/10 backdrop-blur-lg border-white/20">
                    <CardHeader>
                      <div className="flex justify-between items-start">
                        <div>
                          <CardTitle className="text-white">{deal.projects?.title}</CardTitle>
                          <CardDescription className="text-purple-200">
                            Pitched to: {deal.target_buyer_name}
                          </CardDescription>
                        </div>
                        <Badge className={getDealStatusColor(deal.status)}>
                          {deal.status.replace('_', ' ').toUpperCase()}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {deal.feedback_notes && (
                        <p className="text-purple-100 mb-2">{deal.feedback_notes}</p>
                      )}
                      <span className="text-sm text-purple-300">
                        Updated {new Date(deal.updated_at).toLocaleDateString()}
                      </span>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <Card className="bg-white/10 backdrop-blur-lg border-white/20 text-center p-12">
                  <Target className="w-12 h-12 text-purple-400 mx-auto mb-4" />
                  <CardTitle className="text-white mb-2">No Deals in Pipeline</CardTitle>
                  <CardDescription className="text-purple-200">
                    When you start pitching projects to buyers, they'll appear here for tracking.
                  </CardDescription>
                </Card>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}