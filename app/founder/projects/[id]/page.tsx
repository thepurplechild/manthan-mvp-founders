import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";

export default async function FounderProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  // Auth check
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    redirect("/auth/login");
  }

  // Role check
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || profile.role !== "founder") {
    redirect("/dashboard");
  }

  // Project fetch
  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .single();

  if (!project) {
    notFound();
  }

  interface ProjectData {
    name?: string;
    title?: string;
    description?: string;
    synopsis?: string;
    logline?: string;
    created_at?: string;
    [key: string]: unknown;
  }
  
  const projectData = project as ProjectData;
  const name = projectData.name || projectData.title || "Untitled Project";
  const description = projectData.description || projectData.synopsis || projectData.logline || null;
  const createdAt = project.created_at ? new Date(project.created_at).toLocaleString() : undefined;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white">
      <div className="container mx-auto px-6 py-10 max-w-3xl">
        <h1 className="text-4xl font-bold mb-3">{name}</h1>
        {description && (
          <p className="text-purple-200 mb-6">{description}</p>
        )}
        {createdAt && (
          <div className="text-sm text-purple-300 mb-10">Created at: {createdAt}</div>
        )}

        <div className="flex gap-3">
          <Link href="/founder/dashboard" className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 px-4 py-2 rounded-xl text-white border border-white/20">
            Back to Founder Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
