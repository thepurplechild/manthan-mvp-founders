import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function ProjectsIndexPage() {
  const supabase = await createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    redirect("/auth/login");
  }

  const { data: projects } = await supabase
    .from("projects")
    .select("id, title, name, created_at")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  const list = projects || [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white">
      <div className="container mx-auto px-6 py-12 max-w-3xl">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold">Your Projects</h1>
          <Link href="/projects/new" className="inline-flex items-center gap-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 px-4 py-2 rounded-xl text-white">
            Create Project
          </Link>
        </div>

        {list.length === 0 ? (
          <div className="text-center bg-white/10 backdrop-blur-lg border border-white/20 rounded-2xl p-12">
            <h2 className="text-2xl font-semibold mb-2">No projects yet</h2>
            <p className="text-purple-200 mb-6">Start by creating your first project.</p>
            <Link href="/projects/new" className="inline-flex items-center gap-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 px-4 py-2 rounded-xl text-white">
              Create Project
            </Link>
          </div>
        ) : (
          <ul className="space-y-3">
            {list.map((p: Record<string, unknown>) => {
              const name = (p as Record<string, unknown>).name as string || (p as Record<string, unknown>).title as string || "Untitled Project";
              const created = (p as Record<string, unknown>).created_at as string | undefined;
              const when = created ? new Date(created).toLocaleString() : "";
              const id = (p as Record<string, unknown>).id as string;
              return (
                <li key={id} className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-xl px-5 py-4 hover:bg-white/15 transition-colors">
                  <Link href={`/projects/${id}`} className="flex items-center justify-between">
                    <span className="font-medium">{name}</span>
                    <span className="text-sm text-purple-200">{when}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
