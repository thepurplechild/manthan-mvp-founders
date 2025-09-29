'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { Route } from 'next'
import type { UrlObject } from 'url'
import {
  AlertCircle,
  ArrowLeft,
  BarChart3,
  CheckCircle,
  Clock,
  Download,
  FileText,
  ListChecks,
  RefreshCw,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Progress } from '@/components/ui/progress'

import { cn } from '@/lib/utils'
import { useProjectDashboard } from '@/hooks/useProjectDashboard'
import type { ProjectOverviewResponse, ProjectTimelineEntry } from '@/types/projects'
import { ProjectDashboardSkeleton } from './ProjectDashboardSkeleton'

interface ProjectDashboardProps {
  projectId: string
  initialOverview: ProjectOverviewResponse | null
  fallbackTitle: string
}

const fileStatusStyles: Record<string, string> = {
  uploaded: 'bg-gray-100 text-gray-800 border-gray-200',
  queued: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  processing: 'bg-blue-100 text-blue-800 border-blue-200',
  completed: 'bg-green-100 text-green-800 border-green-200',
  failed: 'bg-red-100 text-red-700 border-red-200',
  missing: 'bg-red-100 text-red-700 border-red-200',
}

const timelineStatusStyles: Record<ProjectTimelineEntry['status'], string> = {
  pending: 'border-gray-200 text-gray-500',
  current: 'border-blue-300 text-blue-700 bg-blue-50',
  completed: 'border-green-300 text-green-700 bg-green-50',
}

export function ProjectDashboard({
  projectId,
  initialOverview,
  fallbackTitle,
}: ProjectDashboardProps) {
  const [realtimeEnabled, setRealtimeEnabled] = useState(true)

  const {
    overview,
    isLoading,
    isRefreshing,
    error,
    lastUpdated,
    refresh,
  } = useProjectDashboard(projectId, {
    initialData: initialOverview,
    enableRealtime: realtimeEnabled,
    pollIntervalMs: 90000,
  })

  const projectTitle = overview?.project.title ?? fallbackTitle
  const projectStatus = overview?.project.status ?? 'draft'

  const processingSummary = useMemo(() => {
    if (!overview) {
      return {
        active: 0,
        completed: 0,
        failed: 0,
        progress: 0,
      }
    }

    const active = overview.ingestions.filter((ing) => ['running', 'processing', 'queued'].includes(ing.status)).length
    const completed = overview.ingestions.filter((ing) => ['succeeded', 'completed'].includes(ing.status)).length
    const failed = overview.ingestions.filter((ing) => ing.status === 'failed').length

    const totalSteps = overview.ingestions.length || 1
    const aggregateProgress = Math.round(
      overview.ingestions.reduce((acc, ing) => acc + (ing.progress || 0), 0) / totalSteps
    )

    return {
      active,
      completed,
      failed,
      progress: aggregateProgress,
    }
  }, [overview])

  if (isLoading && !overview) {
    return <ProjectDashboardSkeleton />
  }

  if (!overview) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3 text-sm text-gray-500">
          <Link href="/projects" className="inline-flex items-center gap-2 text-gray-600 hover:text-manthan-saffron-600">
            <ArrowLeft className="h-4 w-4" />
            Back to projects
          </Link>
        </div>
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-red-600" />
              <div>
                <p className="font-semibold text-red-900">Unable to load project overview</p>
                <p className="text-sm text-red-700">
                  {error || 'Please refresh the page or try again later.'}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={refresh} className="ml-auto">
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const nextActions = overview.next_actions

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-sm text-gray-500">
              <Link href="/projects" className="inline-flex items-center gap-2 text-gray-600 hover:text-manthan-saffron-600">
                <ArrowLeft className="h-4 w-4" />
                Back to projects
              </Link>
              <span>•</span>
              <span className="capitalize">{projectStatus.replace('_', ' ')}</span>
            </div>
            <div>
              <h1 className="text-3xl font-heading font-bold text-manthan-charcoal-900">
                {projectTitle}
              </h1>
              <p className="text-manthan-charcoal-600">
                Monitor AI processing progress, review uploads, and track next steps.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
              <Badge variant="outline" className="capitalize">
                Status: {projectStatus.replace('_', ' ')}
              </Badge>
              {lastUpdated && (
                <span>Updated {new Date(lastUpdated).toLocaleTimeString()}</span>
              )}
              {isRefreshing && (
                <span className="inline-flex items-center gap-2 text-manthan-saffron-600">
                  <RefreshCw className="h-3 w-3 animate-spin" />
                  refreshing
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              variant={realtimeEnabled ? 'outline' : 'default'}
              size="sm"
              onClick={() => setRealtimeEnabled((prev) => !prev)}
              className={realtimeEnabled ? 'border-green-300 bg-green-50 text-green-700' : ''}
            >
              <BarChart3 className="h-4 w-4 mr-2" />
              {realtimeEnabled ? 'Realtime on' : 'Enable realtime'}
            </Button>
            <Button variant="outline" size="sm" onClick={refresh}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Link href={`/projects/${projectId}/review`}>
              <Button size="sm" className="bg-manthan-saffron-500 hover:bg-manthan-saffron-600">
                Review outputs
              </Button>
            </Link>
          </div>
        </div>

        {/* Primary navigation */}
        <div className="flex flex-wrap gap-2">
          <NavPill href={{ pathname: '/projects/[id]', query: { id: projectId } }} active>
            Overview
          </NavPill>
          <NavPill href={{ pathname: '/projects/[id]/files', query: { id: projectId } }}>
            Files
          </NavPill>
          <NavPill href={{ pathname: '/projects/[id]/review', query: { id: projectId } }}>
            Review
          </NavPill>
          <NavPill href={{ pathname: '/projects/[id]/settings', query: { id: projectId } }}>
            Settings
          </NavPill>
        </div>
      </div>

      {error && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600" />
              <div>
                <p className="font-semibold text-amber-900">{error}</p>
                <p className="text-sm text-amber-700">Realtime updates may be delayed. Try refreshing manually.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card className="shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <CardDescription>Total files</CardDescription>
                <CardTitle className="mt-1 text-3xl font-semibold text-manthan-charcoal-900">
                  {overview.stats.total_files}
                </CardTitle>
              </div>
              <FileText className="h-8 w-8 text-manthan-saffron-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <CardDescription>Active jobs</CardDescription>
                <CardTitle className="mt-1 text-3xl font-semibold text-manthan-charcoal-900">
                  {processingSummary.active}
                </CardTitle>
              </div>
              <Clock className="h-8 w-8 text-manthan-royal-500" />
            </div>
            <div className="mt-4 space-y-2">
              <Progress value={processingSummary.progress} className="h-2" />
              <p className="text-xs text-gray-500">Aggregate progress {processingSummary.progress}%</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <CardDescription>Completed runs</CardDescription>
                <CardTitle className="mt-1 text-3xl font-semibold text-manthan-charcoal-900">
                  {processingSummary.completed}
                </CardTitle>
              </div>
              <CheckCircle className="h-8 w-8 text-manthan-mint-500" />
            </div>
            <p className="mt-4 text-xs text-gray-500">
              Last completed {overview.stats.last_processed_at ? new Date(overview.stats.last_processed_at).toLocaleString() : '—'}
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <CardDescription>Outputs ready</CardDescription>
                <CardTitle className="mt-1 text-3xl font-semibold text-manthan-charcoal-900">
                  {overview.outputs.total_assets + overview.outputs.content_items + overview.outputs.packages}
                </CardTitle>
              </div>
              <Download className="h-8 w-8 text-manthan-gold-500" />
            </div>
            <p className="mt-4 text-xs text-gray-500">
              Last generated {overview.outputs.last_generated_at ? new Date(overview.outputs.last_generated_at).toLocaleString() : '—'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Timeline & Next actions */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 shadow-sm">
          <CardHeader>
            <CardTitle>Workflow timeline</CardTitle>
            <CardDescription>
              Track progress from project creation to review and approval.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {overview.timeline.map((item) => (
                <div
                  key={item.key}
                  className={`rounded-xl border p-4 transition-colors ${timelineStatusStyles[item.status]}`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-manthan-charcoal-800">
                        {item.label}
                      </p>
                      <p className="text-xs text-manthan-charcoal-500 mt-1">
                        {item.description}
                      </p>
                    </div>
                    <Badge variant="outline" className="capitalize">
                      {item.status}
                    </Badge>
                  </div>
                  {item.timestamp && (
                    <p className="mt-3 text-xs text-gray-500">
                      {new Date(item.timestamp).toLocaleString()}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>What’s next</CardTitle>
            <CardDescription>Follow the recommended next steps to keep momentum.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {nextActions.length === 0 ? (
              <p className="text-sm text-gray-500">
                You’re all set! Visit the review tab to export assets or share with stakeholders.
              </p>
            ) : (
              nextActions.map((action) => (
                <div key={action.key} className="rounded-lg border border-dashed border-manthan-saffron-200 p-4">
                  <p className="font-medium text-manthan-charcoal-800">{action.title}</p>
                  <p className="text-xs text-manthan-charcoal-500 mt-1">{action.description}</p>
                  {action.href && (
                    <Link href={action.href} className="inline-flex items-center gap-2 text-sm text-manthan-saffron-600 hover:text-manthan-saffron-700 mt-3">
                      {action.ctaLabel || 'Open'}
                    </Link>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Processing overview */}
      <Card className="shadow-sm">
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Processing pipeline</CardTitle>
            <CardDescription>Monitor ingestion jobs, retry failures, and inspect progress.</CardDescription>
          </div>
          <Link href={{ pathname: '/projects/[id]/review', query: { id: projectId } }}>
            <Button variant="outline" size="sm" className="inline-flex items-center gap-2">
              <ListChecks className="h-4 w-4" />
              Open detailed dashboard
            </Button>
          </Link>
        </CardHeader>
        <CardContent className="space-y-4">
          {overview.ingestions.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">
              No ingestion jobs yet. Upload a script to start processing.
            </div>
          ) : (
            overview.ingestions
              .slice()
              .reverse()
              .map((ingestion) => (
                <div key={ingestion.id} className="rounded-lg border bg-white p-4 shadow-sm">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-1">
                      <p className="font-medium text-manthan-charcoal-900">
                        {ingestion.source_file_url.split('/').pop() || 'Uploaded file'}
                      </p>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                        <Badge variant="outline" className="capitalize">
                          {ingestion.status}
                        </Badge>
                        <span>{new Date(ingestion.created_at).toLocaleString()}</span>
                        {ingestion.mime_type && <span>{ingestion.mime_type}</span>}
                        {ingestion.error && (
                          <span className="inline-flex items-center gap-1 text-red-600">
                            <AlertCircle className="h-3 w-3" />
                            {ingestion.error}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {ingestion.status === 'failed' && (
                        <Link
                          href={{
                            pathname: '/projects/[id]/review',
                            query: { id: projectId, retry: ingestion.id },
                          }}
                        >
                          <Button size="sm" variant="outline" className="text-red-600 border-red-200">
                            Retry job
                          </Button>
                        </Link>
                      )}
                      {(ingestion.status === 'succeeded' || ingestion.status === 'completed') && (
                        <Link
                          href={{
                            pathname: '/projects/[id]/review',
                            query: { id: projectId, ingestionId: ingestion.id },
                          }}
                        >
                          <Button size="sm" variant="outline">
                            View output
                          </Button>
                        </Link>
                      )}
                    </div>
                  </div>
                  <div className="mt-4 space-y-2">
                    <Progress value={ingestion.progress || 0} className="h-2" />
                    <p className="text-xs text-gray-500">
                      {ingestion.progress || 0}% complete • {ingestion.steps.filter((step) => step.status === 'completed').length} of {ingestion.steps.length} steps finished
                    </p>
                  </div>
                </div>
              ))
          )}
        </CardContent>
      </Card>

      {/* Recent files & outputs */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-start justify-between">
            <div>
              <CardTitle>Recent files</CardTitle>
              <CardDescription>Latest uploads and their processing state.</CardDescription>
            </div>
            <Link
              href={{ pathname: '/projects/[id]/files', query: { id: projectId } }}
              className="text-sm text-manthan-saffron-600 hover:text-manthan-saffron-700"
            >
              Manage files
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>File</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Version</TableHead>
                    <TableHead>Uploaded</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overview.files.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-sm text-gray-500 py-6">
                        No files yet. Upload a script to begin processing.
                      </TableCell>
                    </TableRow>
                  ) : (
                    overview.files.slice(0, 8).map((file) => (
                      <TableRow key={file.id}>
                        <TableCell className="font-medium">{file.file_name}</TableCell>
                        <TableCell>
                          <Badge className={fileStatusStyles[file.status || 'unknown'] || 'bg-gray-100 text-gray-700 border-gray-200'}>
                            {file.status}
                          </Badge>
                        </TableCell>
                        <TableCell>v{file.version}</TableCell>
                        <TableCell className="text-xs text-gray-500">
                          {new Date(file.uploaded_at).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-start justify-between">
            <div>
              <CardTitle>Generated outputs</CardTitle>
              <CardDescription>AI deliverables ready for review and export.</CardDescription>
            </div>
            <Link
              href={{ pathname: '/projects/[id]/review', query: { id: projectId } }}
              className="text-sm text-manthan-saffron-600 hover:text-manthan-saffron-700"
            >
              Open review
            </Link>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <OutputMetric label="Documents" value={overview.outputs.documents} />
              <OutputMetric label="Pitch decks" value={overview.outputs.decks} />
              <OutputMetric label="Visuals" value={overview.outputs.images} />
              <OutputMetric label="Content pieces" value={overview.outputs.content_items} />
            </div>
            <div className="rounded-lg border border-dashed border-gray-200 p-4 text-xs text-gray-500">
              Last generated {overview.outputs.last_generated_at ? new Date(overview.outputs.last_generated_at).toLocaleString() : '—'}. Use the review tab to download, print, or share these assets.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function OutputMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-manthan-charcoal-900">{value}</p>
    </div>
  )
}

function NavPill({ href, children, active = false }: { href: Route | UrlObject; children: React.ReactNode; active?: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex items-center rounded-full border px-4 py-2 text-sm font-medium transition-colors shadow-sm',
        active
          ? 'border-manthan-saffron-500 bg-manthan-saffron-500 text-white'
          : 'border-gray-200 bg-white text-manthan-charcoal-600 hover:border-manthan-saffron-300 hover:bg-manthan-saffron-50 hover:text-manthan-saffron-600'
      )}
    >
      {children}
    </Link>
  )
}
