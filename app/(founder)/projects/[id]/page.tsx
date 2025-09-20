import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Upload, Eye, FileText, CheckCircle, Clock, AlertCircle, Sparkles, Download, ArrowRight } from "lucide-react";

import DealPipelineSection from "@/components/projects/DealPipelineSection";

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  // Get project details
  const { data: project, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !project) {
    notFound();
  }

  // Get ingestions for this project
  const { data: ingestions } = await supabase
    .from("ingestions")
    .select(`
      id,
      status,
      progress,
      created_at,
      finished_at,
      error,
      source_filename,
      project_id
    `)
    .eq("project_id", id)
    .order("created_at", { ascending: false });

  // Get generated assets for completed ingestions
  const { data: assets } = await supabase
    .from("generated_assets")
    .select("*")
    .eq("project_id", id);

  const anyProj = project as Record<string, unknown>;
  const displayName = (anyProj.name as string) || (anyProj.title as string) || "Untitled Project";
  const displayDescription =
    (anyProj.description as string) || (anyProj.synopsis as string) || (anyProj.logline as string) || null;
  const createdAt = project.created_at ? new Date(project.created_at).toLocaleString() : undefined;

  const hasCompletedIngestion = ingestions?.some((ing) => ing.status === "succeeded");
  const hasActiveIngestion = ingestions?.some((ing) => ["queued", "running"].includes(ing.status));

  return (
    <div className="min-h-screen gradient-indian-bg">
      <div className="container mx-auto max-w-4xl px-6 py-10">
        {/* Header */}
        <div className="card-indian mb-6 p-8">
          <div className="mb-4 flex items-start justify-between">
            <div>
              <h1 className="mb-2 text-4xl font-heading font-bold text-manthan-charcoal-800">{displayName}</h1>
              {displayDescription ? (
                <p className="text-lg text-manthan-charcoal-600">{displayDescription}</p>
              ) : null}
              {createdAt ? (
                <div className="mt-2 text-sm text-manthan-charcoal-500">Created: {createdAt}</div>
              ) : null}
            </div>
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-manthan-saffron-500 to-manthan-gold-500 shadow-indian">
              <FileText className="h-8 w-8 text-white" />
            </div>
          </div>
        </div>

        {/* Upload Section */}
        <div className="card-indian mb-6 p-6">
          <h2 className="mb-4 flex items-center gap-3 text-2xl font-semibold text-manthan-charcoal-800">
            <Upload className="h-6 w-6 text-manthan-saffron-600" />
            Script Upload &amp; Processing
          </h2>

          {!ingestions || ingestions.length === 0 ? (
            <div className="py-8 text-center">
              <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-manthan-saffron-50">
                <Upload className="h-10 w-10 text-manthan-saffron-600" />
              </div>
              <h3 className="mb-2 text-xl font-semibold text-manthan-charcoal-800">Ready for Your Script</h3>
              <p className="mb-6 text-manthan-charcoal-600">
                Upload your script to start the AI transformation process and create professional pitch materials.
              </p>
              <Link href={`/projects/${id}/upload`} className="btn-indian inline-flex items-center gap-3 px-8 py-4 text-lg">
                <Upload className="h-5 w-5" />
                Upload Script Files
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {ingestions.map((ingestion) => {
                const status = ingestion.status;
                const progress = ingestion.progress || 0;
                const isActive = ["queued", "running"].includes(status);
                const isComplete = status === "succeeded";
                const isFailed = status === "failed";

                return (
                  <div key={ingestion.id} className="rounded-xl border border-manthan-saffron-200 p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {isComplete ? <CheckCircle className="h-5 w-5 text-manthan-mint-600" /> : null}
                        {isActive ? <Clock className="h-5 w-5 animate-pulse text-manthan-saffron-600" /> : null}
                        {isFailed ? <AlertCircle className="h-5 w-5 text-manthan-coral-600" /> : null}
                        <span className="font-medium text-manthan-charcoal-800">
                          {ingestion.source_filename || "Script Upload"}
                        </span>
                      </div>
                      <span
                        className={`rounded-full px-3 py-1 text-sm ${
                          isComplete
                            ? "bg-manthan-mint-100 text-manthan-mint-700"
                            : isActive
                            ? "bg-manthan-saffron-100 text-manthan-saffron-700"
                            : isFailed
                            ? "bg-manthan-coral-100 text-manthan-coral-700"
                            : "bg-manthan-charcoal-100 text-manthan-charcoal-600"
                        }`}
                      >
                        {status === "succeeded"
                          ? "Complete"
                          : status === "running"
                          ? "Processing"
                          : status === "queued"
                          ? "In Queue"
                          : status === "failed"
                          ? "Failed"
                          : status}
                      </span>
                    </div>

                    {isActive ? (
                      <div className="mb-2">
                        <div className="h-2 w-full overflow-hidden rounded-full bg-manthan-saffron-100">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-manthan-saffron-500 to-manthan-gold-500 transition-all duration-500"
                            style={{ width: `${Math.max(progress, 30)}%` }}
                          />
                        </div>
                        <p className="mt-1 text-sm text-manthan-charcoal-600">{Math.max(progress, 30)}% complete</p>
                      </div>
                    ) : null}

                    {isFailed && ingestion.error ? (
                      <p className="mb-2 text-sm text-manthan-coral-600">{ingestion.error}</p>
                    ) : null}

                    <div className="text-xs text-manthan-charcoal-500">
                      Started: {new Date(ingestion.created_at).toLocaleString()}
                      {ingestion.finished_at ? (
                        <>
                          {' '}
                          • Finished: {new Date(ingestion.finished_at).toLocaleString()}
                        </>
                      ) : null}
                    </div>
                  </div>
                );
              })}

              <div className="flex flex-wrap gap-3 pt-4">
                <Link href={`/projects/${id}/upload`} className="btn-outline-indian inline-flex items-center gap-2">
                  <Upload className="h-4 w-4" />
                  Upload More Files
                </Link>

                {hasActiveIngestion ? (
                  <Link href={`/projects/${id}`} className="btn-outline-indian inline-flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Refresh Status
                  </Link>
                ) : null}
              </div>
            </div>
          )}
        </div>

        {/* AI Pipeline Results */}
        {hasCompletedIngestion ? (
          <div className="card-indian mb-6 p-6">
            <h2 className="mb-4 flex items-center gap-3 text-2xl font-semibold text-manthan-charcoal-800">
              <Sparkles className="h-6 w-6 text-manthan-royal-600" />
              AI Processing Results
            </h2>

            <div className="mb-4 rounded-xl border border-manthan-mint-200 bg-manthan-mint-50 p-4">
              <div className="mb-2 flex items-center gap-3">
                <CheckCircle className="h-5 w-5 text-manthan-mint-600" />
                <span className="font-medium text-manthan-mint-800">Processing Complete!</span>
              </div>
              <p className="mb-4 text-manthan-mint-700">
                Your script has been analyzed and transformed through our 6-step AI pipeline. Professional pitch materials
                are ready for download.
              </p>

              <div className="flex flex-wrap gap-3">
                <Link href={`/ingestion/results?projectId=${id}`} className="btn-indian inline-flex items-center gap-2">
                  <Eye className="h-4 w-4" />
                  View Full Analysis
                </Link>

                {assets && assets.length > 0 ? (
                  <Link
                    href={`/ingestion/results?projectId=${id}#downloads`}
                    className="btn-outline-indian inline-flex items-center gap-2"
                  >
                    <Download className="h-4 w-4" />
                    Download Assets ({assets.length})
                  </Link>
                ) : null}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {[
                { name: "Content Extraction", icon: FileText, color: "manthan-saffron" },
                { name: "Character Analysis", icon: Eye, color: "manthan-royal" },
                { name: "Market Adaptation", icon: CheckCircle, color: "manthan-mint" },
                { name: "Pitch Assembly", icon: Sparkles, color: "manthan-gold" },
                { name: "Visual Elements", icon: Eye, color: "manthan-coral" },
                { name: "Final Package", icon: Download, color: "manthan-saffron" },
              ].map((step) => (
                <div
                  key={step.name}
                  className={`rounded-lg border border-${step.color}-200 bg-${step.color}-50 p-3 text-center`}
                >
                  <step.icon className={`mx-auto mb-1 h-5 w-5 text-${step.color}-600`} />
                  <p className={`text-xs font-medium text-${step.color}-800`}>{step.name}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <DealPipelineSection projectId={id} />

        <div className="flex flex-wrap gap-3">
          <Link href="/dashboard" className="btn-outline-indian inline-flex items-center gap-2">
            <ArrowRight className="h-4 w-4 rotate-180" />
            Back to Dashboard
          </Link>
          <Link href="/projects/new" className="btn-outline-indian inline-flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Create New Project
          </Link>
        </div>
      </div>
    </div>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .single();

  const title =
    ((project as Record<string, unknown>)?.name as string) ||
    ((project as Record<string, unknown>)?.title as string) ||
    "Project";
  return { title } as const;
}
