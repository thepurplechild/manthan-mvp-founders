import { getRlsServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ArrowLeft, AlertCircle } from "lucide-react";
import IndiaProjectFields from "@/components/projects/IndiaProjectFields";
import { CreateProjectForm } from "@/components/projects/CreateProjectForm";

type Props = {
  searchParams?: Promise<{ error?: string }>;
};

export default async function NewProjectPage({ searchParams }: Props) {
  const supabase = await getRlsServerClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/auth/login");
  }

  // Handle search params for error display
  const resolvedSearchParams = await searchParams;
  const error = resolvedSearchParams?.error;

  const createProject = async (formData: FormData) => {
    "use server";
    
    const title = formData.get("title") as string;
    const logline = formData.get("logline") as string;
    const synopsis = formData.get("synopsis") as string;
    // Multi-select fields come as multiple entries
    const genre = formData.getAll("genre") as string[];
    const budgetRange = (formData.get("budget_range") as string) || null;
    const targetPlatforms = formData.getAll("target_platforms") as string[];
    const languages = formData.getAll("languages") as string[];
    const audience = formData.getAll("target_audience") as string[];
    
    const supabase = await getRlsServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      redirect("/auth/login");
      return;
    }

    const { data: project, error } = await supabase
      .from("projects")
      .insert({
        owner_id: user.id,
        title,
        logline: logline || null,
        synopsis: synopsis || null,
        genre: Array.isArray(genre) ? genre : [],
        budget_range: budgetRange,
        target_platforms: Array.isArray(targetPlatforms) ? targetPlatforms : [],
        // Store India-specific fields safely in JSON without schema changes
        character_breakdowns: {
          india_metadata: {
            languages,
            target_audience: audience,
          }
        },
        status: "draft"
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating project:", error);
      redirect("/projects/new?error=Failed to create project");
      return;
    }

    redirect(`/projects/${project.id}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Navigation */}
      <nav className="border-b border-white/10 bg-black/20">
        <div className="container mx-auto px-6 py-4">
          <Link 
            href="/dashboard" 
            className="inline-flex items-center gap-2 text-purple-200 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </Link>
        </div>
      </nav>

      <div className="container mx-auto px-6 py-12 max-w-2xl">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-4">Create New Project</h1>
          <p className="text-purple-200 text-lg">
            Start by telling us about your creative project. We'll help you turn it into a professional pitch.
          </p>
        </div>

        <Card className="bg-white/10 backdrop-blur-lg border-white/20">
          <CardHeader>
            <CardTitle className="text-white">Project Details</CardTitle>
            <CardDescription className="text-purple-200">
              Provide the basic information about your script and project
            </CardDescription>
          </CardHeader>

          <CardContent>
            {/* Error Message */}
            {error && (
              <div className="mb-6 p-4 bg-red-500/20 border border-red-500/30 rounded-lg flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                <p className="text-red-200">{error}</p>
              </div>
            )}

            <CreateProjectForm createProject={createProject} />
          </CardContent>
        </Card>

        <div className="mt-8 text-center">
          <p className="text-purple-300 text-sm">
            After creating your project, you'll be able to upload your script and generate AI-powered pitch materials.
          </p>
        </div>
      </div>
    </div>
  );
}
