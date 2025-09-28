'use client'

import { useState, useEffect } from 'react'
import {
  Edit2,
  FileText,
  Download,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  Play,
  Pause,
  Monitor,
  Settings,
  MessageSquare,
  ThumbsUp,
  ThumbsDown,
  RotateCcw
} from 'lucide-react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'

import { ProjectReviewData } from '@/app/projects/[id]/review/page'
import { ProjectOverviewSection } from './ProjectOverviewSection'
import { ScriptDisplaySection } from './ScriptDisplaySection'
import { ProcessingStatusDashboard } from './ProcessingStatusDashboard'
import { GeneratedAssetsSection } from './GeneratedAssetsSection'
import { ReviewApprovalSection } from './ReviewApprovalSection'
import { useProjectReview } from '@/hooks/useProjectReview'

interface ProjectReviewClientProps {
  initialData: ProjectReviewData
}

export default function ProjectReviewClient({ initialData }: ProjectReviewClientProps) {
  const {
    data,
    isLoading,
    error,
    updateProject,
    approveProject,
    requestRevisions,
    submitFeedback,
    retryProcessing,
    refreshData
  } = useProjectReview(initialData)

  const [activeTab, setActiveTab] = useState('overview')
  const [autoRefresh, setAutoRefresh] = useState(true)

  // Auto-refresh for real-time updates
  useEffect(() => {
    if (!autoRefresh) return

    const interval = setInterval(() => {
      // Only refresh if there are active processing steps
      const hasActiveProcessing = data.processing_steps.some(
        step => step.status === 'running' || step.status === 'pending'
      )

      if (hasActiveProcessing) {
        refreshData()
      }
    }, 10000) // 10 seconds

    return () => clearInterval(interval)
  }, [autoRefresh, data.processing_steps, refreshData])

  const getProjectStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800 border-green-200'
      case 'processing':
        return 'bg-blue-100 text-blue-800 border-blue-200'
      case 'draft':
        return 'bg-gray-100 text-gray-800 border-gray-200'
      case 'approved':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200'
      case 'revision_requested':
        return 'bg-amber-100 text-amber-800 border-amber-200'
      case 'rejected':
        return 'bg-red-100 text-red-800 border-red-200'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const getProcessingProgress = () => {
    const totalSteps = data.processing_steps.length
    if (totalSteps === 0) return 0

    const completedSteps = data.processing_steps.filter(
      step => step.status === 'completed'
    ).length

    return Math.round((completedSteps / totalSteps) * 100)
  }

  const hasErrors = data.processing_steps.some(step => step.status === 'failed')
  const isProcessing = data.processing_steps.some(step => step.status === 'running')
  const isCompleted = data.processing_steps.length > 0 &&
    data.processing_steps.every(step =>
      step.status === 'completed' || step.status === 'skipped'
    )

  if (error) {
    return (
      <div className="max-w-7xl mx-auto">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-red-600" />
              <div>
                <p className="font-semibold text-red-900">Error loading project data</p>
                <p className="text-sm text-red-700">{error}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={refreshData}
                className="ml-auto"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header Section */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            {data.project.title}
          </h1>
          <p className="text-gray-600">
            Review project materials and approve for production
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Auto-refresh toggle */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={autoRefresh ? 'border-green-300 bg-green-50' : ''}
          >
            {autoRefresh ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            <span className="ml-2">Auto-refresh</span>
          </Button>

          {/* Manual refresh */}
          <Button
            variant="outline"
            size="sm"
            onClick={refreshData}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>

          {/* Project status */}
          <Badge className={getProjectStatusColor(data.project.status)}>
            {data.project.status.replace('_', ' ')}
          </Badge>
        </div>
      </div>

      {/* Quick Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Processing Progress</p>
                <p className="text-2xl font-bold text-gray-900">{getProcessingProgress()}%</p>
              </div>
              <Monitor className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Scripts Uploaded</p>
                <p className="text-2xl font-bold text-gray-900">{data.ingestions.length}</p>
              </div>
              <FileText className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Assets Generated</p>
                <p className="text-2xl font-bold text-gray-900">{data.generated_assets.length}</p>
              </div>
              <Download className="h-8 w-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Status</p>
                <div className="flex items-center gap-2">
                  {isCompleted && <CheckCircle className="h-5 w-5 text-green-600" />}
                  {isProcessing && <Clock className="h-5 w-5 text-blue-600 animate-pulse" />}
                  {hasErrors && <XCircle className="h-5 w-5 text-red-600" />}
                  <span className="text-sm font-medium">
                    {isCompleted ? 'Complete' : isProcessing ? 'Processing' : hasErrors ? 'Has Errors' : 'Ready'}
                  </span>
                </div>
              </div>
              <Settings className="h-8 w-8 text-gray-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <Monitor className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="scripts" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Scripts
          </TabsTrigger>
          <TabsTrigger value="processing" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Processing
          </TabsTrigger>
          <TabsTrigger value="assets" className="flex items-center gap-2">
            <Download className="h-4 w-4" />
            Assets
          </TabsTrigger>
          <TabsTrigger value="review" className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Review
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <ProjectOverviewSection
            data={data}
            onUpdate={updateProject}
            isLoading={isLoading}
          />
        </TabsContent>

        <TabsContent value="scripts" className="space-y-6">
          <ScriptDisplaySection
            data={data}
            onRefresh={refreshData}
            isLoading={isLoading}
          />
        </TabsContent>

        <TabsContent value="processing" className="space-y-6">
          <ProcessingStatusDashboard
            data={data}
            onRetry={retryProcessing}
            onRefresh={refreshData}
            isLoading={isLoading}
          />
        </TabsContent>

        <TabsContent value="assets" className="space-y-6">
          <GeneratedAssetsSection
            data={data}
            onRefresh={refreshData}
            isLoading={isLoading}
          />
        </TabsContent>

        <TabsContent value="review" className="space-y-6">
          <ReviewApprovalSection
            data={data}
            onApprove={approveProject}
            onRequestRevisions={requestRevisions}
            onSubmitFeedback={submitFeedback}
            isLoading={isLoading}
          />
        </TabsContent>
      </Tabs>

      {/* Quick Actions Floating Panel - Only show if processing is complete */}
      {isCompleted && !data.approval_status.approved && (
        <Card className="fixed bottom-6 right-6 w-80 shadow-lg border-2 border-blue-200 bg-blue-50">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              Ready for Review
            </CardTitle>
            <CardDescription>
              All processing complete. Review and approve this project.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              className="w-full bg-green-600 hover:bg-green-700"
              onClick={() => setActiveTab('review')}
            >
              <ThumbsUp className="h-4 w-4 mr-2" />
              Review & Approve
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setActiveTab('review')}
            >
              <MessageSquare className="h-4 w-4 mr-2" />
              Leave Feedback
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}