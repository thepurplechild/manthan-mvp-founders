import type { ReactNode } from 'react'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { notFound, redirect } from 'next/navigation'
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle,
  Clock,
  Download,
  FileText,
  Loader2,
  PlayCircle,
  RefreshCw,
  User,
  XCircle,
} from 'lucide-react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export const runtime = 'nodejs'
export const maxDuration = 60

// Human-in-the-Loop Pipeline Step Configuration
const STEP_SEQUENCE = [
  'script_preprocess',   // Step 1: File parsing (automated)
  'core_extraction',     // Step 2: Core elements (automated)
  'character_bible',     // Step 3: Characters (founder approval required)
  'visuals',            // Step 4: Visual concepts (founder approval required)
  'market_adaptation',   // Step 5: Market adaptation (founder approval required)
  'package_assembly',    // Step 6: Pitch content assembly (founder approval required)
  'final_package'       // Step 7: Final package (founder approval required)
] as const;

type StepName = (typeof STEP_SEQUENCE)[number];
type StepStatus = 'pending' | 'running' | 'succeeded' | 'failed';

// User-friendly step display names
const STEP_DISPLAY_NAMES: Record<StepName, string> = {
  script_preprocess: 'File Parsing & Structural Analysis',
  core_extraction: 'Core Elements Extraction',
  character_bible: 'Character Bible Generation',
  visuals: 'Visual Concepts Development',
  market_adaptation: 'Market Adaptation Strategy',
  package_assembly: 'Pitch Content Assembly',
  final_package: 'Final Package Integration'
};

// Step descriptions for founder context
const STEP_DESCRIPTIONS: Record<StepName, string> = {
  script_preprocess: 'Parses uploaded script file and extracts raw text content',
  core_extraction: 'Analyzes script structure and extracts key story elements',
  character_bible: 'Generates comprehensive character profiles and relationships',
  visuals: 'Creates visual concept briefs and scene descriptions',
  market_adaptation: 'Adapts content for target markets and platforms',
  package_assembly: 'Assembles components into pitch-ready presentation',
  final_package: 'Finalizes deliverables and prepares for distribution'
};

// Status styling and metadata
const STATUS_META: Record<StepStatus, { label: string; badgeClass: string; icon?: ReactNode }> = {
  pending: {
    label: 'Pending',
    badgeClass: 'border-gray-300 bg-gray-100 text-gray-700',
    icon: <Clock className="h-3.5 w-3.5" />
  },
  running: {
    label: 'Processing',
    badgeClass: 'border-blue-200 bg-blue-100 text-blue-700',
    icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />
  },
  succeeded: {
    label: 'Completed',
    badgeClass: 'border-green-200 bg-green-100 text-green-700',
    icon: <CheckCircle className="h-3.5 w-3.5" />
  },
  failed: {
    label: 'Failed',
    badgeClass: 'border-red-200 bg-red-100 text-red-700',
    icon: <XCircle className="h-3.5 w-3.5" />
  },
};

// TypeScript interfaces for data structures
interface ProjectRecord {
  id: string;
  title: string | null;
  description: string | null;
  status: string | null;
  created_at: string | null;
  owner_id: string | null;
}

interface ProfileRecord {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  avatar_url: string | null;
  created_at: string | null;
}

interface ScriptUploadRecord {
  id: string;
  file_name: string | null;
  file_size: number | null;
  file_path: string | null;
  uploaded_at: string | null;
  mime_type: string | null;
}

interface IngestionRecord {
  id: string;
  status: string | null;
  progress: number | null;
  created_at: string | null;
  updated_at: string | null;
  error: string | null;
}

interface IngestionStepRecord {
  id: string;
  ingestion_id: string;
  name: string;
  status: string | null;
  output: unknown;
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

interface NormalizedStep {
  name: StepName;
  status: StepStatus;
  output: unknown;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  duration: string | null;
  createdAt: string | null;
}

interface ProjectData {
  project: ProjectRecord | null;
  creator: ProfileRecord | null;
  scriptUpload: ScriptUploadRecord | null;
  ingestion: IngestionRecord | null;
  steps: IngestionStepRecord[];
  scriptDownloadUrl: string | null;
  scriptUrlExpiry: string | null;
}

// Server Action for triggering pipeline steps
async function triggerPipelineStep(ingestionId: string, stepName: StepName): Promise<{ success: boolean; message: string }> {
  'use server';

  try {
    // Authentication & Authorization
    const supabase = await createRlsClient();
    if (!supabase) {
      return { success: false, message: 'Authentication service unavailable' };
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, message: 'Authentication required' };
    }

    // Verify founder role
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile || profile.role !== 'founder') {
      return { success: false, message: 'Founder access required' };
    }

    // Call our pipeline trigger endpoint
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || 'http://localhost:3000';
    const endpoint = `${baseUrl}/api/founder/trigger-pipeline-step`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': await getCookieHeader(),
      },
      body: JSON.stringify({
        ingestionId,
        stepName
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        message: errorData.error || `HTTP ${response.status}: ${response.statusText}`
      };
    }

    const result = await response.json();
    return {
      success: true,
      message: result.message || `Step ${stepName} triggered successfully`
    };

  } catch (error) {
    console.error('[triggerPipelineStep] error:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

// Helper function to get cookie header
async function getCookieHeader(): Promise<string> {
  const cookieStore = await cookies();
  return cookieStore.getAll().map(({ name, value }) => `${name}=${value}`).join('; ');
}

// Create RLS Supabase client with cookies
async function createRlsClient(): Promise<SupabaseClient | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return null;
  }

  const cookieStore = await cookies();
  const cookieHeader = cookieStore.getAll().map(({ name, value }) => `${name}=${value}`).join('; ');

  return createSupabaseClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: cookieHeader ? { Cookie: cookieHeader } : undefined,
    },
  });
}

// Create service role client for data fetching
function createServiceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRole) {
    return null;
  }

  return createSupabaseClient(url, serviceRole, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

// Authentication and authorization check
async function verifyFounderAccess(): Promise<{ isAuthorized: boolean; userId: string | null; message: string }> {
  const supabase = await createRlsClient();
  if (!supabase) {
    return { isAuthorized: false, userId: null, message: 'Authentication service unavailable' };
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { isAuthorized: false, userId: null, message: 'Authentication required' };
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) {
    return { isAuthorized: false, userId: user.id, message: 'Unable to verify permissions' };
  }

  if (profile.role !== 'founder') {
    return { isAuthorized: false, userId: user.id, message: 'Founder access required' };
  }

  return { isAuthorized: true, userId: user.id, message: 'Access granted' };
}

// Comprehensive data fetching function
async function fetchProjectData(projectId: string): Promise<ProjectData> {
  const supabase = createServiceClient();
  if (!supabase) {
    throw new Error('Database service unavailable');
  }

  const result: ProjectData = {
    project: null,
    creator: null,
    scriptUpload: null,
    ingestion: null,
    steps: [],
    scriptDownloadUrl: null,
    scriptUrlExpiry: null,
  };

  // Fetch project details
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id, title, description, status, created_at, owner_id')
    .eq('id', projectId)
    .single();

  if (projectError) {
    console.error('[fetchProjectData] project error:', projectError);
    throw new Error('Project not found');
  }

  result.project = project;

  // Fetch creator information
  if (project.owner_id) {
    const { data: creator, error: creatorError } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, avatar_url, created_at')
      .eq('id', project.owner_id)
      .single();

    if (creatorError) {
      console.error('[fetchProjectData] creator error:', creatorError);
    } else {
      result.creator = creator;
    }
  }

  // Fetch script upload details
  const { data: scriptUploads, error: scriptError } = await supabase
    .from('script_uploads')
    .select('id, file_name, file_size, file_path, uploaded_at, mime_type')
    .eq('project_id', projectId)
    .order('uploaded_at', { ascending: false })
    .limit(1);

  if (scriptError) {
    console.error('[fetchProjectData] script error:', scriptError);
  } else if (scriptUploads && scriptUploads.length > 0) {
    result.scriptUpload = scriptUploads[0];

    // Generate signed URL for script download
    if (result.scriptUpload.file_path) {
      try {
        const { data: signedUrl, error: urlError } = await supabase.storage
          .from('scripts')
          .createSignedUrl(result.scriptUpload.file_path, 1800); // 30 minutes

        if (urlError) {
          console.error('[fetchProjectData] signed URL error:', urlError);
        } else if (signedUrl) {
          result.scriptDownloadUrl = signedUrl.signedUrl;
          result.scriptUrlExpiry = new Date(Date.now() + 1800 * 1000).toISOString();
        }
      } catch (error) {
        console.error('[fetchProjectData] storage error:', error);
      }
    }
  }

  // Fetch ingestion record
  const { data: ingestion, error: ingestionError } = await supabase
    .from('ingestions')
    .select('id, status, progress, created_at, updated_at, error')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (ingestionError) {
    console.error('[fetchProjectData] ingestion error:', ingestionError);
  } else {
    result.ingestion = ingestion;

    // Fetch pipeline steps
    const { data: steps, error: stepsError } = await supabase
      .from('ingestion_steps')
      .select('id, ingestion_id, name, status, output, error, started_at, finished_at, created_at, updated_at')
      .eq('ingestion_id', ingestion.id)
      .order('created_at', { ascending: true });

    if (stepsError) {
      console.error('[fetchProjectData] steps error:', stepsError);
    } else if (steps) {
      result.steps = steps;
    }
  }

  return result;
}

// Normalize step data for consistent display
function normalizeSteps(rawSteps: IngestionStepRecord[]): NormalizedStep[] {
  const stepMap = new Map<string, IngestionStepRecord>();

  rawSteps.forEach(step => {
    if (step.name) {
      stepMap.set(step.name, step);
    }
  });

  return STEP_SEQUENCE.map(stepName => {
    const rawStep = stepMap.get(stepName);
    const status = normalizeStatus(rawStep?.status);

    let duration: string | null = null;
    if (rawStep?.started_at && rawStep?.finished_at) {
      const start = new Date(rawStep.started_at);
      const end = new Date(rawStep.finished_at);
      const diffMs = end.getTime() - start.getTime();
      const minutes = Math.floor(diffMs / 60000);
      const seconds = Math.floor((diffMs % 60000) / 1000);
      duration = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
    }

    return {
      name: stepName,
      status,
      output: rawStep?.output || null,
      error: rawStep?.error || null,
      startedAt: rawStep?.started_at || null,
      finishedAt: rawStep?.finished_at || null,
      duration,
      createdAt: rawStep?.created_at || null,
    };
  });
}

// Normalize status strings to typed values
function normalizeStatus(status: string | null | undefined): StepStatus {
  const cleaned = (status || '').toLowerCase();
  if (['pending', 'running', 'succeeded', 'failed'].includes(cleaned)) {
    return cleaned as StepStatus;
  }
  return 'pending';
}

// Determine which step can be triggered next
function getNextRunnableStep(steps: NormalizedStep[]): StepName | null {
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (step.status === 'pending') {
      // First step can always run, others need previous step to succeed
      if (i === 0 || steps[i - 1].status === 'succeeded') {
        return step.name;
      }
    }
  }
  return null;
}

// Check if a specific step can be triggered
function canTriggerStep(stepName: StepName, steps: NormalizedStep[]): boolean {
  const stepIndex = STEP_SEQUENCE.indexOf(stepName);
  if (stepIndex === -1) return false;

  const step = steps[stepIndex];
  if (step.status !== 'pending') return false;

  // First step can always be triggered
  if (stepIndex === 0) return true;

  // Other steps need previous step to succeed
  return steps[stepIndex - 1].status === 'succeeded';
}

// Format timestamps for display
function formatDateTime(dateString: string | null | undefined): string {
  if (!dateString) return '—';

  try {
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(dateString));
  } catch {
    return dateString;
  }
}

// Format file size for display
function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes) return '—';

  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

// Get overall pipeline status
function getOverallStatus(steps: NormalizedStep[], ingestionStatus: string | null): { label: string; badgeClass: string } {
  if (ingestionStatus === 'failed' || steps.some(s => s.status === 'failed')) {
    return { label: 'Failed', badgeClass: STATUS_META.failed.badgeClass };
  }

  if (ingestionStatus === 'processing' || steps.some(s => s.status === 'running')) {
    return { label: 'Processing', badgeClass: STATUS_META.running.badgeClass };
  }

  if (ingestionStatus === 'completed' || steps.every(s => s.status === 'succeeded')) {
    return { label: 'Completed', badgeClass: STATUS_META.succeeded.badgeClass };
  }

  return { label: 'Pending', badgeClass: STATUS_META.pending.badgeClass };
}

// Server Action wrapper for step triggering
async function handleStepTrigger(
  projectId: string,
  ingestionId: string,
  stepName: StepName,
  formData: FormData
): Promise<void> {
  'use server';

  const result = await triggerPipelineStep(ingestionId, stepName);

  if (result.success) {
    // Revalidate the page to show updated data
    revalidatePath(`/founder/projects/${projectId}`);
  } else {
    // In a real implementation, you might want to handle errors differently
    // For now, we'll just revalidate anyway to show current state
    revalidatePath(`/founder/projects/${projectId}`);
    throw new Error(result.message);
  }
}

// UI Components

function StatusBadge({ status }: { status: StepStatus }) {
  const meta = STATUS_META[status];
  return (
    <Badge variant="outline" className={cn('gap-1.5', meta.badgeClass)}>
      {meta.icon}
      {meta.label}
    </Badge>
  );
}

function StepOutput({ output }: { output: unknown }) {
  if (!output) return null;

  const formattedOutput = typeof output === 'string'
    ? output
    : JSON.stringify(output, null, 2);

  return (
    <details className="mt-4 rounded-lg border border-gray-200 bg-gray-50">
      <summary className="cursor-pointer p-4 font-medium text-gray-900 hover:bg-gray-100">
        View AI Generated Output
      </summary>
      <div className="border-t border-gray-200 p-4">
        <pre className="max-h-80 overflow-auto rounded bg-white p-3 text-sm text-gray-800 whitespace-pre-wrap">
          {formattedOutput}
        </pre>
      </div>
    </details>
  );
}

function TriggerStepButton({
  projectId,
  ingestionId,
  stepName,
  label,
  variant = "default",
  disabled = false
}: {
  projectId: string;
  ingestionId: string;
  stepName: StepName;
  label: string;
  variant?: "default" | "destructive" | "outline";
  disabled?: boolean;
}) {
  const action = handleStepTrigger.bind(null, projectId, ingestionId, stepName);

  return (
    <form action={action}>
      <Button type="submit" variant={variant} disabled={disabled} className="gap-2">
        <PlayCircle className="h-4 w-4" />
        {label}
      </Button>
    </form>
  );
}

// Main Page Component
export default async function FounderProjectReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = await params;

  // Authentication & Authorization
  const auth = await verifyFounderAccess();
  if (!auth.isAuthorized) {
    if (!auth.userId) {
      redirect(`/auth/login?redirect=${encodeURIComponent(`/founder/projects/${projectId}`)}`);
    }

    return (
      <div className="mx-auto max-w-4xl px-6 py-16">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <AlertCircle className="h-5 w-5 text-amber-500" />
              Access Denied
            </CardTitle>
            <CardDescription>{auth.message}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              This command center is restricted to founders only. If you believe this is an error,
              please contact support to verify your role permissions.
            </p>
            <Button asChild>
              <Link href="/dashboard">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Dashboard
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Data Fetching
  let projectData: ProjectData;
  try {
    projectData = await fetchProjectData(projectId);
  } catch (error) {
    console.error('[FounderProjectReviewPage] data fetch error:', error);
    notFound();
  }

  if (!projectData.project) {
    notFound();
  }

  const normalizedSteps = normalizeSteps(projectData.steps);
  const nextRunnableStep = getNextRunnableStep(normalizedSteps);
  const overallStatus = getOverallStatus(normalizedSteps, projectData.ingestion?.status || null);

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      {/* Page Header */}
      <header className="mb-8">
        <div className="mb-4">
          <Link
            href="/founder/dashboard"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Founder Dashboard
          </Link>
        </div>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <h1 className="text-3xl font-bold tracking-tight">
              {projectData.project.title || 'Untitled Project'}
            </h1>
            <p className="text-lg text-muted-foreground max-w-3xl">
              {projectData.project.description || 'No description available for this project.'}
            </p>
            <div className="flex flex-wrap gap-3">
              <Badge variant="outline" className={cn('gap-2', overallStatus.badgeClass)}>
                <FileText className="h-3.5 w-3.5" />
                {overallStatus.label}
              </Badge>
              <Badge variant="secondary">
                Project ID: {projectData.project.id}
              </Badge>
            </div>
          </div>

          {/* Creator Information */}
          <Card className="w-full max-w-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <User className="h-4 w-4" />
                Project Creator
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="font-medium">
                {projectData.creator?.full_name || 'Unknown Creator'}
              </p>
              <p className="text-sm text-muted-foreground">
                {projectData.creator?.email || 'Email not available'}
              </p>
              <p className="text-xs text-muted-foreground">
                Member since {formatDateTime(projectData.creator?.created_at)}
              </p>
            </CardContent>
          </Card>
        </div>
      </header>

      {/* Script Information Section */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Script Information
          </CardTitle>
          <CardDescription>
            Original script file uploaded for processing
          </CardDescription>
        </CardHeader>
        <CardContent>
          {projectData.scriptUpload ? (
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-2">
                <p className="font-medium">
                  {projectData.scriptUpload.file_name || 'Unknown filename'}
                </p>
                <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                  <span>Size: {formatFileSize(projectData.scriptUpload.file_size)}</span>
                  <span>Type: {projectData.scriptUpload.mime_type || 'Unknown'}</span>
                  <span>Uploaded: {formatDateTime(projectData.scriptUpload.uploaded_at)}</span>
                </div>
              </div>
              {projectData.scriptDownloadUrl ? (
                <Button asChild>
                  <a
                    href={projectData.scriptDownloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="gap-2"
                  >
                    <Download className="h-4 w-4" />
                    Download Original Script
                  </a>
                </Button>
              ) : (
                <Button disabled>
                  <Download className="h-4 w-4 mr-2" />
                  Download Unavailable
                </Button>
              )}
            </div>
          ) : (
            <p className="text-muted-foreground">No script file available</p>
          )}
        </CardContent>
      </Card>

      {/* Pipeline Progress Overview */}
      <Card className="mb-8">
        <CardHeader>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <RefreshCw className="h-5 w-5" />
                AI Pipeline Progress
              </CardTitle>
              <CardDescription>
                Human-in-the-loop AI processing workflow with founder approval gates
              </CardDescription>
            </div>
            {nextRunnableStep && projectData.ingestion && (
              <TriggerStepButton
                projectId={projectId}
                ingestionId={projectData.ingestion.id}
                stepName={nextRunnableStep}
                label={`Run ${STEP_DISPLAY_NAMES[nextRunnableStep]}`}
              />
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {normalizedSteps.map((step, index) => (
              <div
                key={step.name}
                className="rounded-lg border border-gray-200 bg-gray-50 p-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">
                    Step {index + 1}
                  </span>
                  <StatusBadge status={step.status} />
                </div>
                <h4 className="font-medium text-sm mb-1">
                  {STEP_DISPLAY_NAMES[step.name]}
                </h4>
                <p className="text-xs text-muted-foreground">
                  {step.duration || '—'}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Detailed Step Cards */}
      <div className="space-y-6">
        {normalizedSteps.map((step, index) => (
          <Card key={step.name} className="overflow-hidden">
            <CardHeader>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                  <CardTitle className="flex items-center gap-3">
                    <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary text-sm font-medium">
                      {index + 1}
                    </span>
                    {STEP_DISPLAY_NAMES[step.name]}
                    <StatusBadge status={step.status} />
                  </CardTitle>
                  <CardDescription>
                    {STEP_DESCRIPTIONS[step.name]}
                  </CardDescription>
                  <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                    {step.startedAt && (
                      <span>Started: {formatDateTime(step.startedAt)}</span>
                    )}
                    {step.finishedAt && (
                      <span>Completed: {formatDateTime(step.finishedAt)}</span>
                    )}
                    {step.duration && (
                      <span>Duration: {step.duration}</span>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {step.status === 'failed' && projectData.ingestion && (
                    <TriggerStepButton
                      projectId={projectId}
                      ingestionId={projectData.ingestion.id}
                      stepName={step.name}
                      label="Retry Step"
                      variant="destructive"
                    />
                  )}
                  {step.status === 'pending' &&
                   canTriggerStep(step.name, normalizedSteps) &&
                   projectData.ingestion && (
                    <TriggerStepButton
                      projectId={projectId}
                      ingestionId={projectData.ingestion.id}
                      stepName={step.name}
                      label="Run This Step"
                      variant="outline"
                    />
                  )}
                  {step.status === 'running' && (
                    <Button disabled variant="secondary" className="gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Processing...
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {step.error && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4">
                  <div className="flex items-start gap-2">
                    <XCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <h5 className="font-medium text-red-900 mb-1">Step Failed</h5>
                      <p className="text-sm text-red-700">{step.error}</p>
                    </div>
                  </div>
                </div>
              )}
              {step.status === 'succeeded' && step.output ? (
                <StepOutput output={step.output} />
              ) : null}
              {step.status === 'running' && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                    <p className="text-sm text-blue-700">
                      Processing in progress... This may take a few minutes.
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Action Bar */}
      <Card className="mt-8">
        <CardContent className="flex flex-wrap gap-4 p-6">
          <form action={async () => {
            'use server';
            revalidatePath(`/founder/projects/${projectId}`);
          }}>
            <Button type="submit" variant="outline" className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Refresh Status
            </Button>
          </form>
          <Button asChild variant="outline">
            <Link href="/founder/dashboard" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Dashboard
            </Link>
          </Button>
          {normalizedSteps.every(step => step.status === 'succeeded') && (
            <Button className="gap-2">
              <CheckCircle className="h-4 w-4" />
              Publish Project
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Footer */}
      <footer className="mt-8 pt-6 border-t border-gray-200 text-center">
        <p className="text-xs text-muted-foreground">
          Founder Command Center • Last updated: {formatDateTime(new Date().toISOString())}
        </p>
      </footer>
    </div>
  );
}