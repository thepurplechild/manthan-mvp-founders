import { createClient } from "@/lib/supabase/server";
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
import { ArrowLeft } from "lucide-react";
import IndiaProjectFields from "@/components/projects/IndiaProjectFields";

export default async function NewProjectPage() {
  const supabase = await createClient();
  
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    redirect("/auth/login");
  }

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
    
    const supabase = await createClient();
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
            <form action={createProject} className="space-y-6">
              {/* Title */}
              <div className="space-y-2">
                <Label htmlFor="title" className="text-white">
                  Project Title *
                </Label>
                <Input
                  id="title"
                  name="title"
                  type="text"
                  required
                  placeholder="Enter your project title"
                  className="bg-white/5 border-white/20 text-white placeholder-purple-300"
                />
              </div>

              {/* Logline */}
              <div className="space-y-2">
                <Label htmlFor="logline" className="text-white">
                  Logline
                </Label>
                <Input
                  id="logline"
                  name="logline"
                  type="text"
                  placeholder="A compelling one-sentence summary of your story"
                  className="bg-white/5 border-white/20 text-white placeholder-purple-300"
                />
                <p className="text-sm text-purple-300">
                  A concise, engaging summary that captures the essence of your story
                </p>
              </div>

              {/* Synopsis */}
              <div className="space-y-2">
                <Label htmlFor="synopsis" className="text-white">
                  Synopsis
                </Label>
                <Textarea
                  id="synopsis"
                  name="synopsis"
                  rows={4}
                  placeholder="Provide a detailed summary of your story, including main characters, plot, and themes"
                  className="bg-white/5 border-white/20 text-white placeholder-purple-300"
                />
                <p className="text-sm text-purple-300">
                  A more detailed overview of your story (optional but recommended)
                </p>
              </div>

              {/* India-specific fields */}
              <IndiaProjectFields />

              {/* Submit Button */}
              <div className="pt-4">
                <Button
                  type="submit"
                  className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold py-3"
                >
                  Create Project
                </Button>
              </div>
            </form>
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
