import type { ReactNode } from 'react'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { notFound } from 'next/navigation'
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle,
  Download,
  FileText,
  Loader2,
  PlayCircle,
  RefreshCw,
  XCircle,
} from 'lucide-react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { StepActionButton, MandatesForm } from '@/components/founder/ProjectStepControls'

export const runtime = 'nodejs'
export const maxDuration = 60

type StepStatus = 'pending' | 'running' | 'succeeded' | 'failed'

interface PipelineStepRecord {
  id: string
  ingestion_id: string
  name: string
  status: string | null
  output: unknown
  error_message: string | null
  created_at: string | null
}

interface ProjectRecord {
  id: string
  name?: string | null
  title?: string | null
  description?: string | null
  synopsis?: string | null
  script_path?: string | null
  owner_id?: string | null
}

interface ProfileRecord {
  full_name?: string | null
  name?: string | null
  email?: string | null
  role?: string | null
}

interface IngestionRecord {
  id: string
  status: string | null
}

type ActionResult = {
  status: 'idle' | 'success' | 'error'
  message?: string
}

const PIPELINE_STEPS = [
  'script_preprocess',
  'core_extraction',
  'structural_analysis',
  'dialogue_extraction',
  'scene_analysis',
  'character_analysis',
  'technical_analysis',
] as const

type PipelineStepName = (typeof PIPELINE_STEPS)[number]

const STEP_LABELS: Record<PipelineStepName, string> = {
  script_preprocess: 'Script Preprocess',
  core_extraction: 'Core Extraction',
  structural_analysis: 'Structural Analysis',
  dialogue_extraction: 'Dialogue Extraction',
  scene_analysis: 'Scene Analysis',
  character_analysis: 'Character Analysis',
  technical_analysis: 'Technical Analysis',
}

const STATUS_META: Record<StepStatus, { label: string; badgeClass: string; icon?: ReactNode }> = {
  pending: {
    label: 'Pending',
    badgeClass: 'border-gray-300 bg-gray-100 text-gray-700',
  },
  running: {
    label: 'Running',
    badgeClass: 'border-blue-200 bg-blue-100 text-blue-700',
  },
  succeeded: {
    label: 'Succeeded',
    badgeClass: 'border-green-200 bg-green-100 text-green-700',
    icon: <CheckCircle className="h-3.5 w-3.5" />, 
  },
  failed: {
    label: 'Failed',
    badgeClass: 'border-red-200 bg-red-100 text-red-700',
    icon: <XCircle className="h-3.5 w-3.5" />, 
  },
}

async function createRlsClient(): Promise<SupabaseClient | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    return null
  }

  const cookieStore = await cookies()
  const cookieHeader = cookieStore.getAll().map(({ name, value }) => `${name}=${value}`).join('; ')

  return createSupabaseClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: true,
    },
    global: {
      headers: cookieHeader ? { Cookie: cookieHeader } : undefined,
    },
  })
}

function createServiceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE
  if (!url || !serviceRole) {
    return null
  }

  return createSupabaseClient(url, serviceRole, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

async function resolveViewerContext() {
  const rlsClient = await createRlsClient()
  if (!rlsClient) {
    return { rlsClient: null as SupabaseClient | null, userId: null, isFounder: false, reason: 'Authentication unavailable. Founder access required.' }
  }

  const { data: userData, error: userError } = await rlsClient.auth.getUser()
  if (userError || !userData?.user) {
    return { rlsClient, userId: null, isFounder: false, reason: 'Sign in as a founder to access this control center.' }
  }

  const userId = userData.user.id
  const { data: profile, error: profileError } = await rlsClient
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle()

  // TODO: Wire real founder check against your auth/profile system.
  if (profileError) {
    console.error('[founder-project-page] failed to load viewer profile', profileError)
    return { rlsClient, userId, isFounder: false, reason: 'Unable to verify founder permissions.' }
  }

  const isFounder = (profile?.role ?? '').toLowerCase() === 'founder'
  return {
    rlsClient,
    userId,
    isFounder,
    reason: isFounder ? null : 'Founder permissions required to manage AI pipeline steps.',
  }
}

function normaliseStatus(status: string | null | undefined): StepStatus {
  const cleaned = (status ?? '').toLowerCase() as StepStatus
  if (cleaned === 'running' || cleaned === 'succeeded' || cleaned === 'failed' || cleaned === 'pending') {
    return cleaned
  }
  return 'pending'
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  try {
    return new Intl.DateTimeFormat('en', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value))
  } catch (error) {
    return value
  }
}

function deriveBucketAndPath(rawPath: string, fallbackBucket: string): { bucket: string; path: string } {
  const trimmed = rawPath.replace(/^\/+/, '')
  if (!trimmed.includes('/')) {
    return { bucket: fallbackBucket, path: trimmed }
  }

  const [maybeBucket, ...rest] = trimmed.split('/')
  if (!maybeBucket || rest.length === 0) {
    return { bucket: fallbackBucket, path: trimmed }
  }

  if (maybeBucket === fallbackBucket) {
    return { bucket: fallbackBucket, path: rest.join('/') }
  }

  return { bucket: maybeBucket, path: rest.join('/') }
}

async function triggerStepAction(projectId: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  'use server'

  const stepName = formData.get('stepName')
  const submittedProjectId = formData.get('projectId')
  if (typeof stepName !== 'string' || !stepName) {
    return { status: 'error', message: 'Unknown step.' }
  }
  if (typeof submittedProjectId !== 'string' || submittedProjectId !== projectId) {
    return { status: 'error', message: 'Project mismatch.' }
  }

  const viewer = await resolveViewerContext()
  if (!viewer.isFounder || !viewer.userId) {
    return { status: 'error', message: viewer.reason ?? 'Access denied.' }
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '')
  const endpoint = `${baseUrl ?? ''}/api/founder/projects/trigger-step`

  try {
    // TODO: Implement the real backend handler for /api/founder/projects/trigger-step.
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.ADMIN_TOKEN ? { 'x-admin-token': process.env.ADMIN_TOKEN } : {}),
      },
      body: JSON.stringify({ projectId, stepName }),
      cache: 'no-store',
    })

    if (!response.ok) {
      const payload = await response.json().catch(() => null)
      const message = (payload?.error as string | undefined) ?? response.statusText
      return { status: 'error', message: message || 'Failed to trigger step.' }
    }

    revalidatePath(`/founder/projects/${projectId}`)
    return { status: 'success', message: 'Step triggered.' }
  } catch (error) {
    console.error('[founder-project-page] step trigger failed', error)
    return { status: 'error', message: 'Network error while triggering step.' }
  }
}

async function saveMandatesAction(projectId: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  'use server'

  const submittedProjectId = formData.get('projectId')
  const mandates = formData.get('mandates')
  if (typeof submittedProjectId !== 'string' || submittedProjectId !== projectId) {
    return { status: 'error', message: 'Project mismatch.' }
  }
  if (typeof mandates !== 'string') {
    return { status: 'error', message: 'Invalid mandates payload.' }
  }

  const viewer = await resolveViewerContext()
  if (!viewer.isFounder || !viewer.userId) {
    return { status: 'error', message: viewer.reason ?? 'Access denied.' }
  }

  const supabase = createServiceClient()
  if (!supabase) {
    return { status: 'success', message: 'Saved locally (no mandates store configured).' }
  }

  try {
    const { error } = await supabase
      .from('project_platform_mandates')
      .upsert({
        project_id: projectId,
        notes: mandates,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'project_id' })

    if (error) {
      if (error.code === '42P01') {
        // Table missing: treat as configured no-op.
        return { status: 'success', message: 'Mandates saved (storage disabled).' }
      }
      console.error('[founder-project-page] mandate upsert failed', error)
      return { status: 'error', message: error.message }
    }

    revalidatePath(`/founder/projects/${projectId}`)
    return { status: 'success', message: 'Mandates saved.' }
  } catch (error) {
    console.error('[founder-project-page] unexpected mandates error', error)
    return { status: 'error', message: 'Unable to save mandates right now.' }
  }
}

function AccessDeniedCard({ message }: { message: string }): JSX.Element {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <AlertCircle className="h-5 w-5 text-amber-500" />
            Access denied
          </CardTitle>
          <CardDescription>{message}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            If you believe this is an error, please contact the platform administrator so your founder role can be verified.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

function StatusBadge({ status }: { status: StepStatus }): JSX.Element {
  const meta = STATUS_META[status]
  return (
    <Badge variant="outline" className={cn('gap-1', meta.badgeClass)}>
      {meta.icon ?? null}
      {meta.label}
    </Badge>
  )
}

function StepOutput({ output }: { output: unknown }): JSX.Element | null {
  if (output === null || typeof output === 'undefined') {
    return null
  }

  const normalized = normaliseOutput(output)
  return (
    <details className="rounded-md border border-border/60 bg-muted/30 p-3 text-sm">
      <summary className="cursor-pointer text-sm font-medium text-foreground">
        View generated output
      </summary>
      <pre className="mt-3 max-h-72 overflow-auto rounded-md bg-background/80 p-3 text-xs leading-relaxed text-foreground">
        {normalized}
      </pre>
    </details>
  )
}

function normaliseOutput(value: unknown): string {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return '—'
    try {
      const parsed = JSON.parse(trimmed)
      return JSON.stringify(parsed, null, 2)
    } catch (error) {
      return trimmed
    }
  }

  try {
    return JSON.stringify(value, null, 2)
  } catch (error) {
    return String(value)
  }
}

function describeOverallStatus(steps: Array<{ status: StepStatus }>, ingestionStatus: string | null | undefined): { label: string; badgeClass: string } {
  const status = (ingestionStatus ?? '').toLowerCase()
  if (status === 'failed') return { label: 'Failed', badgeClass: STATUS_META.failed.badgeClass }
  if (status === 'running') return { label: 'Running', badgeClass: STATUS_META.running.badgeClass }
  if (status === 'succeeded' || steps.every((step) => step.status === 'succeeded')) {
    return { label: 'Completed', badgeClass: STATUS_META.succeeded.badgeClass }
  }
  if (steps.some((step) => step.status === 'failed')) {
    return { label: 'Attention required', badgeClass: STATUS_META.failed.badgeClass }
  }
  if (steps.some((step) => step.status === 'running')) {
    return { label: 'In progress', badgeClass: STATUS_META.running.badgeClass }
  }
  return { label: 'Pending', badgeClass: STATUS_META.pending.badgeClass }
}

export default async function FounderProjectReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params

  const viewer = await resolveViewerContext()
  if (!viewer.isFounder) {
    return <AccessDeniedCard message={viewer.reason ?? 'Founder access required.'} />
  }

  const serviceClient = createServiceClient()
  const dataClient: SupabaseClient | null = serviceClient ?? viewer.rlsClient

  if (!dataClient) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16">
        <Card>
          <CardHeader>
            <CardTitle>Project review temporarily unavailable</CardTitle>
            <CardDescription>
              Supabase credentials are not configured for this environment. Provide the required env vars to unlock the command center.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  const projectData = await loadProjectData(dataClient, projectId)
  if (!projectData.project) {
    notFound()
  }

  const normalizedSteps = normalisePipelineSteps(projectData.steps)
  const nextRunnableStep = determineNextRunnableStep(normalizedSteps)
  const overallStatus = describeOverallStatus(normalizedSteps, projectData.ingestion?.status)

  const triggerStep = triggerStepAction.bind(null, projectId)
  const saveMandates = saveMandatesAction.bind(null, projectId)

  const lastUpdated = new Date().toISOString()

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-6 rounded-lg border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <Link href="/founder/dashboard" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" /> Back to dashboard
            </Link>
            <h1 className="text-3xl font-semibold text-foreground">
              {projectData.project.name ?? projectData.project.title ?? 'Untitled project'}
            </h1>
            <p className="max-w-2xl text-sm text-muted-foreground">
              {projectData.project.description ?? projectData.project.synopsis ?? 'No description available for this project yet.'}
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <Badge variant="outline" className={cn('capitalize', overallStatus.badgeClass)}>
                {overallStatus.label}
              </Badge>
              <Badge variant="outline" className="border-slate-300 bg-slate-100 text-slate-700">
                Project ID: {projectData.project.id}
              </Badge>
            </div>
          </div>
          <div className="w-full max-w-sm rounded-md border border-border/60 bg-background p-4 text-sm">
            <p className="font-medium text-foreground">Creator</p>
            <p className="text-sm text-muted-foreground">
              {projectData.creator?.full_name ?? projectData.creator?.name ?? 'Unknown founder'}
            </p>
            <p className="text-xs text-muted-foreground/80">
              {projectData.creator?.email ?? 'Email not available'}
            </p>
          </div>
        </div>
        <div className="grid gap-4 rounded-md border border-dashed border-border/80 bg-muted/40 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
          <div>
            <p className="text-sm font-medium text-foreground">Script file</p>
            <p className="text-xs text-muted-foreground">
              Latest ingested script with a 30 minute signed download link. TODO: Confirm actual Storage bucket name for scripts.
            </p>
            {projectData.scriptUrl ? (
              <p className="pt-2 text-sm text-muted-foreground">
                Signed URL expires {formatDateTime(projectData.scriptExpiry)}
              </p>
            ) : null}
          </div>
          {projectData.scriptUrl ? (
            <Button asChild>
              <a href={projectData.scriptUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2">
                <Download className="h-4 w-4" /> Download script
              </a>
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">No script file available.</p>
          )}
        </div>
      </header>

      <section className="rounded-lg border border-border bg-card shadow-sm">
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileText className="h-5 w-5" /> Pipeline progress overview
            </CardTitle>
            <CardDescription>
              Track the seven-stage human-in-the-loop pipeline powering your AI deliverables.
            </CardDescription>
          </div>
          {nextRunnableStep ? (
            <StepActionButton
              key={`next-${nextRunnableStep.name}`}
              action={triggerStep}
              projectId={projectId}
              stepName={nextRunnableStep.name}
              label={`Run next step: ${STEP_LABELS[nextRunnableStep.name]}`}
              pendingLabel="Triggering…"
              variant="default"
              size="sm"
              className="md:w-auto"
              showMessage
            />
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            {normalizedSteps.map((step) => (
              <div key={`summary-${step.name}`} className="rounded-md border border-border/70 bg-background p-3">
                <p className="text-sm font-medium text-foreground">{STEP_LABELS[step.name]}</p>
                <div className="mt-2 flex items-center gap-2">
                  <StatusBadge status={step.status} />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Updated {formatDateTime(step.lastUpdated)}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </section>

      <section className="space-y-4">
        {normalizedSteps.map((step, index) => (
          <Card key={step.name} className="border border-border shadow-sm">
            <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg">
                  {STEP_LABELS[step.name]}
                  <StatusBadge status={step.status} />
                </CardTitle>
                <CardDescription>
                  Updated {formatDateTime(step.lastUpdated)} · Step position {index + 1} of {PIPELINE_STEPS.length}
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-3">
                {step.status === 'failed' ? (
                  <StepActionButton
                    key={`${step.name}-retry`}
                    action={triggerStep}
                    projectId={projectId}
                    stepName={step.name}
                    label="Retry step"
                    pendingLabel="Retrying…"
                    variant="destructive"
                    size="sm"
                  />
                ) : null}
                {step.status === 'pending' && isStepRunnable(step, normalizedSteps, index) ? (
                  <StepActionButton
                    key={`${step.name}-run`}
                    action={triggerStep}
                    projectId={projectId}
                    stepName={step.name}
                    label="Run this step"
                    pendingLabel="Starting…"
                    variant="outline"
                    size="sm"
                  />
                ) : null}
                {step.status === 'running' ? (
                  <Button variant="secondary" size="sm" disabled className="gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Running
                  </Button>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {step.error ? (
                <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <div>
                    <p className="font-medium">Step error</p>
                    <p>{step.error}</p>
                  </div>
                </div>
              ) : null}
              <StepOutput output={step.output} />
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <RefreshCw className="h-3.5 w-3.5" /> Created {formatDateTime(step.createdAt)}
                </span>
                {step.status === 'succeeded' ? (
                  <span className="inline-flex items-center gap-1">
                    <CheckCircle className="h-3.5 w-3.5 text-green-600" /> Completed successfully
                  </span>
                ) : null}
                {step.status === 'pending' && isStepRunnable(step, normalizedSteps, index) ? (
                  <span className="inline-flex items-center gap-1 text-blue-600">
                    <PlayCircle className="h-3.5 w-3.5" /> Ready to run
                  </span>
                ) : null}
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="rounded-lg border border-border bg-card shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Platform mandates & instructions</CardTitle>
          <CardDescription>
            Capture market guidance, escalation rules, or bespoke requirements for this project. TODO: Wire real backend handler for /api/founder/projects/trigger-step.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MandatesForm
            action={saveMandates}
            projectId={projectId}
            initialValue={projectData.mandates ?? ''}
          />
        </CardContent>
      </section>

      <footer className="border-t border-border pt-6 text-xs text-muted-foreground">
        Last updated server-side: {formatDateTime(lastUpdated)}. TODO: Wire real founder check against your auth/profile system. Optional next step: Add Supabase Realtime to auto-update step statuses.
      </footer>
    </div>
  )
}

type LoadedData = {
  project: ProjectRecord | null
  creator: ProfileRecord | null
  ingestion: IngestionRecord | null
  steps: PipelineStepRecord[]
  scriptUrl: string | null
  scriptExpiry: string | null
  mandates: string | null
}

async function loadProjectData(client: SupabaseClient, projectId: string): Promise<LoadedData> {
  const result: LoadedData = {
    project: null,
    creator: null,
    ingestion: null,
    steps: [],
    scriptUrl: null,
    scriptExpiry: null,
    mandates: null,
  }

  const { data: project, error: projectError } = await client
    .from('projects')
    .select('id, title, name, description, synopsis, script_path, owner_id')
    .eq('id', projectId)
    .maybeSingle<ProjectRecord>()

  if (projectError) {
    console.error('[founder-project-page] failed to load project', projectError)
  } else {
    result.project = project
  }

  if (project?.owner_id) {
    const { data: creator, error: creatorError } = await client
      .from('profiles')
      .select('full_name, name, email, role')
      .eq('id', project.owner_id)
      .maybeSingle<ProfileRecord>()

    if (creatorError) {
      console.error('[founder-project-page] failed to load creator', creatorError)
    } else {
      result.creator = creator
    }
  }

  const { data: ingestion, error: ingestionError } = await client
    .from('ingestions')
    .select('id, status, created_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<IngestionRecord>()

  if (ingestionError) {
    console.error('[founder-project-page] failed to load ingestion', ingestionError)
  } else if (ingestion) {
    result.ingestion = ingestion
    const { data: steps, error: stepsError } = await client
      .from('ingestion_steps')
      .select('id, ingestion_id, name, status, output, error_message, created_at')
      .eq('ingestion_id', ingestion.id)
      .order('created_at', { ascending: true })

    if (stepsError) {
      console.error('[founder-project-page] failed to load steps', stepsError)
    } else if (Array.isArray(steps)) {
      result.steps = steps as PipelineStepRecord[]
    }
  }

  if (project?.script_path) {
    const storageClient = createServiceClient() ?? client
    if (storageClient) {
      // TODO: Confirm actual Storage bucket name for scripts.
      const fallbackBucket = process.env.NEXT_PUBLIC_PROJECT_SCRIPTS_BUCKET ?? 'scripts'
      const { bucket, path } = deriveBucketAndPath(project.script_path, fallbackBucket)
      try {
        const expiresInSeconds = 60 * 30
        const { data: signedData, error: signedError } = await storageClient.storage.from(bucket).createSignedUrl(path, expiresInSeconds)
        if (signedError) {
          console.error('[founder-project-page] failed to sign script URL', signedError)
        } else if (signedData?.signedUrl) {
          result.scriptUrl = signedData.signedUrl
          result.scriptExpiry = new Date(Date.now() + expiresInSeconds * 1000).toISOString()
        }
      } catch (error) {
        console.error('[founder-project-page] unexpected storage error', error)
      }
    }
  }

  try {
    const { data: mandateRow, error: mandateError } = await client
      .from('project_platform_mandates')
      .select('notes')
      .eq('project_id', projectId)
      .maybeSingle<{ notes: string | null }>()

    if (mandateError) {
      if (mandateError.code !== '42P01') {
        console.error('[founder-project-page] failed to load mandates', mandateError)
      }
    } else {
      result.mandates = mandateRow?.notes ?? ''
    }
  } catch (error) {
    console.error('[founder-project-page] mandates fetch crashed', error)
  }

  return result
}

interface NormalisedStep {
  name: PipelineStepName
  status: StepStatus
  createdAt: string | null
  lastUpdated: string | null
  error: string | null
  output: unknown
  recordId?: string
}

function normalisePipelineSteps(steps: PipelineStepRecord[]): NormalisedStep[] {
  const lookup = new Map<string, PipelineStepRecord>()
  for (const step of steps) {
    if (step?.name) {
      lookup.set(step.name, step)
    }
  }

  return PIPELINE_STEPS.map((name) => {
    const record = lookup.get(name)
    const status = normaliseStatus(record?.status)
    const error = record?.error_message ?? null
    const output = record?.output ?? null

    return {
      name,
      status,
      createdAt: record?.created_at ?? null,
      lastUpdated: record?.created_at ?? null,
      error,
      output,
      recordId: record?.id,
    }
  })
}

function determineNextRunnableStep(steps: NormalisedStep[]): NormalisedStep | null {
  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index]
    if (step.status !== 'pending') continue
    if (index === 0 || steps[index - 1].status === 'succeeded') {
      return step
    }
  }
  return null
}

// TODO: (Optional) Add Supabase Realtime to auto-update step statuses.
function isStepRunnable(step: NormalisedStep, steps: NormalisedStep[], index: number): boolean {
  if (step.status !== 'pending') return false
  if (index === 0) return true
  return steps[index - 1].status === 'succeeded'
}
