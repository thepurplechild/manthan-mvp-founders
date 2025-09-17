import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Upload, Eye, FileText, CheckCircle, Clock, AlertCircle, Sparkles, Download, ArrowRight } from "lucide-react";

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

  const anyProj = project as Record<string, unknown>
  const displayName = (anyProj.name as string) || (anyProj.title as string) || "Untitled Project";
  const displayDescription = (anyProj.description as string) || (anyProj.synopsis as string) || (anyProj.logline as string) || null;
  const createdAt = project.created_at ? new Date(project.created_at).toLocaleString() : undefined;

  const latestIngestion = ingestions?.[0];
  const hasCompletedIngestion = ingestions?.some(ing => ing.status === 'succeeded');
  const hasActiveIngestion = ingestions?.some(ing => ['queued', 'running'].includes(ing.status));

  return (
    <div className="min-h-screen gradient-indian-bg">
      <div className="container mx-auto px-6 py-10 max-w-4xl">
        {/* Header */}
        <div className="card-indian p-8 mb-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h1 className="text-4xl font-heading font-bold text-manthan-charcoal-800 mb-2">{displayName}</h1>
              {displayDescription && (
                <p className="text-manthan-charcoal-600 text-lg">{displayDescription}</p>
              )}
              {createdAt && (
                <div className="text-sm text-manthan-charcoal-500 mt-2">Created: {createdAt}</div>
              )}
            </div>
            <div className="bg-gradient-to-br from-manthan-saffron-500 to-manthan-gold-500 w-16 h-16 rounded-2xl flex items-center justify-center shadow-indian">
              <FileText className="w-8 h-8 text-white" />
            </div>
          </div>
        </div>

        {/* Upload Section */}
        <div className="card-indian p-6 mb-6">
          <h2 className="text-2xl font-semibold text-manthan-charcoal-800 mb-4 flex items-center gap-3">
            <Upload className="w-6 h-6 text-manthan-saffron-600" />
            Script Upload & Processing
          </h2>
          
          {!ingestions || ingestions.length === 0 ? (
            // No uploads yet
            <div className="text-center py-8">
              <div className="bg-manthan-saffron-50 w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Upload className="w-10 h-10 text-manthan-saffron-600" />
              </div>
              <h3 className="text-xl font-semibold text-manthan-charcoal-800 mb-2">Ready for Your Script</h3>
              <p className="text-manthan-charcoal-600 mb-6">Upload your script to start the AI transformation process and create professional pitch materials.</p>
              <Link 
                href={`/projects/${id}/upload`}
                className="btn-indian inline-flex items-center gap-3 text-lg px-8 py-4"
              >
                <Upload className="w-5 h-5" />
                Upload Script Files
              </Link>
            </div>
          ) : (
            // Show upload status and history
            <div className="space-y-4">
              {ingestions.map((ingestion) => {
                const status = ingestion.status;
                const progress = ingestion.progress || 0;
                const isActive = ['queued', 'running'].includes(status);
                const isComplete = status === 'succeeded';
                const isFailed = status === 'failed';
                
                return (
                  <div key={ingestion.id} className="border border-manthan-saffron-200 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        {isComplete && <CheckCircle className="w-5 h-5 text-manthan-mint-600" />}
                        {isActive && <Clock className="w-5 h-5 text-manthan-saffron-600 animate-pulse" />}
                        {isFailed && <AlertCircle className="w-5 h-5 text-manthan-coral-600" />}
                        <span className="font-medium text-manthan-charcoal-800">
                          {ingestion.source_filename || 'Script Upload'}
                        </span>
                      </div>
                      <span className={`text-sm px-3 py-1 rounded-full ${
                        isComplete ? 'bg-manthan-mint-100 text-manthan-mint-700' :
                        isActive ? 'bg-manthan-saffron-100 text-manthan-saffron-700' :
                        isFailed ? 'bg-manthan-coral-100 text-manthan-coral-700' :
                        'bg-manthan-charcoal-100 text-manthan-charcoal-600'
                      }`}>
                        {status === 'succeeded' ? 'Complete' : 
                         status === 'running' ? 'Processing' :
                         status === 'queued' ? 'In Queue' :
                         status === 'failed' ? 'Failed' : status}
                      </span>
                    </div>
                    
                    {isActive && (
                      <div className="mb-2">
                        <div className="w-full bg-manthan-saffron-100 h-2 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-gradient-to-r from-manthan-saffron-500 to-manthan-gold-500 rounded-full transition-all duration-500" 
                            style={{ width: `${Math.max(progress, 30)}%` }}
                          />
                        </div>
                        <p className="text-sm text-manthan-charcoal-600 mt-1">{Math.max(progress, 30)}% complete</p>
                      </div>
                    )}
                    
                    {isFailed && ingestion.error && (
                      <p className="text-sm text-manthan-coral-600 mb-2">{ingestion.error}</p>
                    )}
                    
                    <div className="text-xs text-manthan-charcoal-500">
                      Started: {new Date(ingestion.created_at).toLocaleString()}
                      {ingestion.finished_at && (
                        <> • Finished: {new Date(ingestion.finished_at).toLocaleString()}</>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Action buttons */}
              <div className="flex flex-wrap gap-3 pt-4">
                <Link 
                  href={`/projects/${id}/upload`}
                  className="btn-outline-indian inline-flex items-center gap-2"
                >
                  <Upload className="w-4 h-4" />
                  Upload More Files
                </Link>
                
                {hasActiveIngestion && (
                  <Link 
                    href={`/projects/${id}`}
                    className="btn-outline-indian inline-flex items-center gap-2"
                  >
                    <Clock className="w-4 h-4" />
                    Refresh Status
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>

        {/* AI Pipeline Results */}
        {hasCompletedIngestion && (
          <div className="card-indian p-6 mb-6">
            <h2 className="text-2xl font-semibold text-manthan-charcoal-800 mb-4 flex items-center gap-3">
              <Sparkles className="w-6 h-6 text-manthan-royal-600" />
              AI Processing Results
            </h2>
            
            <div className="bg-manthan-mint-50 border border-manthan-mint-200 rounded-xl p-4 mb-4">
              <div className="flex items-center gap-3 mb-2">
                <CheckCircle className="w-5 h-5 text-manthan-mint-600" />
                <span className="font-medium text-manthan-mint-800">Processing Complete!</span>
              </div>
              <p className="text-manthan-mint-700 mb-4">Your script has been analyzed and transformed through our 6-step AI pipeline. Professional pitch materials are ready for download.</p>
              
              <div className="flex flex-wrap gap-3">
                <Link 
                  href={`/ingestion/results?projectId=${id}`}
                  className="btn-indian inline-flex items-center gap-2"
                >
                  <Eye className="w-4 h-4" />
                  View Full Analysis
                </Link>
                
                {assets && assets.length > 0 && (
                  <Link 
                    href={`/ingestion/results?projectId=${id}#downloads`}
                    className="btn-outline-indian inline-flex items-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Download Assets ({assets.length})
                  </Link>
                )}
              </div>
            </div>
            
            {/* Pipeline steps preview */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {[
                { name: 'Content Extraction', icon: FileText, color: 'manthan-saffron' },
                { name: 'Character Analysis', icon: Eye, color: 'manthan-royal' },
                { name: 'Market Adaptation', icon: CheckCircle, color: 'manthan-mint' },
                { name: 'Pitch Assembly', icon: Sparkles, color: 'manthan-gold' },
                { name: 'Visual Elements', icon: Eye, color: 'manthan-coral' },
                { name: 'Final Package', icon: Download, color: 'manthan-saffron' }
              ].map((step, idx) => (
                <div key={step.name} className={`bg-${step.color}-50 border border-${step.color}-200 rounded-lg p-3 text-center`}>
                  <step.icon className={`w-5 h-5 text-${step.color}-600 mx-auto mb-1`} />
                  <p className={`text-xs font-medium text-${step.color}-800`}>{step.name}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex flex-wrap gap-3">
          <Link href="/dashboard" className="btn-outline-indian inline-flex items-center gap-2">
            <ArrowRight className="w-4 h-4 rotate-180" />
            Back to Dashboard
          </Link>
          <Link href="/projects/new" className="btn-outline-indian inline-flex items-center gap-2">
            <FileText className="w-4 h-4" />
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

  const title = (project as Record<string, unknown>)?.name as string || (project as Record<string, unknown>)?.title as string || "Project";
  return { title } as const;
}