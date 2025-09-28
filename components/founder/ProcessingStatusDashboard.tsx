'use client'

import { useState, useEffect } from 'react'
import {
  Play,
  Pause,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  RotateCcw,
  ChevronDown,
  ChevronRight,
  Monitor,
  TrendingUp,
  Zap,
  Brain,
  FileText,
  Package,
  RefreshCw
} from 'lucide-react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

import { ProjectReviewData } from '@/app/projects/[id]/review/page'

interface ProcessingStatusDashboardProps {
  data: ProjectReviewData
  onRetry: (stepId: string) => Promise<void>
  onRefresh: () => void
  isLoading: boolean
}

interface ProcessingStep {
  id: string
  step: string
  status: string
  started_at: string | null
  finished_at: string | null
  error: any
  retry_count: number
  created_at: string
}

export function ProcessingStatusDashboard({
  data,
  onRetry,
  onRefresh,
  isLoading
}: ProcessingStatusDashboardProps) {
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set())
  const [retryingSteps, setRetryingSteps] = useState<Set<string>>(new Set())

  const stepOrder = ['extract', 'characters', 'market', 'pitch', 'visuals', 'assembly']
  const stepIcons: Record<string, any> = {
    extract: FileText,
    characters: Brain,
    market: TrendingUp,
    pitch: Zap,
    visuals: Monitor,
    assembly: Package
  }

  const stepDescriptions: Record<string, string> = {
    extract: 'Extracting content and analyzing script structure',
    characters: 'Building character profiles and relationships',
    market: 'Analyzing market trends and positioning',
    pitch: 'Generating pitch deck and presentation materials',
    visuals: 'Creating visual assets and design elements',
    assembly: 'Assembling final deliverables and packages'
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'text-green-600 bg-green-100 border-green-200'
      case 'running':
        return 'text-blue-600 bg-blue-100 border-blue-200'
      case 'failed':
        return 'text-red-600 bg-red-100 border-red-200'
      case 'pending':
        return 'text-gray-600 bg-gray-100 border-gray-200'
      case 'skipped':
        return 'text-yellow-600 bg-yellow-100 border-yellow-200'
      default:
        return 'text-gray-600 bg-gray-100 border-gray-200'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-600" />
      case 'running':
        return <Clock className="h-5 w-5 text-blue-600 animate-pulse" />
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-600" />
      case 'pending':
        return <Clock className="h-5 w-5 text-gray-400" />
      case 'skipped':
        return <AlertTriangle className="h-5 w-5 text-yellow-600" />
      default:
        return <Clock className="h-5 w-5 text-gray-400" />
    }
  }

  const calculateProgress = () => {
    if (data.processing_steps.length === 0) return 0

    const completed = data.processing_steps.filter(step => step.status === 'completed').length
    return Math.round((completed / data.processing_steps.length) * 100)
  }

  const calculateDuration = (startTime: string | null, endTime: string | null) => {
    if (!startTime) return null

    const start = new Date(startTime)
    const end = endTime ? new Date(endTime) : new Date()
    const diffMs = end.getTime() - start.getTime()

    const minutes = Math.floor(diffMs / 60000)
    const seconds = Math.floor((diffMs % 60000) / 1000)

    if (minutes > 0) {
      return `${minutes}m ${seconds}s`
    }
    return `${seconds}s`
  }

  const getEstimatedCompletion = () => {
    const runningSteps = data.processing_steps.filter(step => step.status === 'running')
    if (runningSteps.length === 0) return null

    // Simple estimation based on average step duration
    const completedSteps = data.processing_steps.filter(step =>
      step.status === 'completed' && step.started_at && step.finished_at
    )

    if (completedSteps.length === 0) return 'Calculating...'

    const avgDuration = completedSteps.reduce((acc, step) => {
      const duration = new Date(step.finished_at!).getTime() - new Date(step.started_at!).getTime()
      return acc + duration
    }, 0) / completedSteps.length

    const remainingSteps = data.processing_steps.filter(step =>
      step.status === 'pending' || step.status === 'running'
    ).length

    const estimatedMs = remainingSteps * avgDuration
    const estimatedMinutes = Math.round(estimatedMs / 60000)

    return `~${estimatedMinutes} minutes`
  }

  const toggleStepExpansion = (stepId: string) => {
    const newExpanded = new Set(expandedSteps)
    if (newExpanded.has(stepId)) {
      newExpanded.delete(stepId)
    } else {
      newExpanded.add(stepId)
    }
    setExpandedSteps(newExpanded)
  }

  const handleRetry = async (stepId: string) => {
    setRetryingSteps(prev => new Set(prev).add(stepId))
    try {
      await onRetry(stepId)
    } finally {
      setRetryingSteps(prev => {
        const newSet = new Set(prev)
        newSet.delete(stepId)
        return newSet
      })
    }
  }

  const hasActiveProcessing = data.processing_steps.some(step => step.status === 'running')
  const hasErrors = data.processing_steps.some(step => step.status === 'failed')
  const isComplete = data.processing_steps.length > 0 &&
    data.processing_steps.every(step => step.status === 'completed' || step.status === 'skipped')

  return (
    <div className="space-y-6">
      {/* Overall Progress */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle className="text-xl flex items-center gap-2">
              <Monitor className="h-5 w-5" />
              AI Processing Pipeline
            </CardTitle>
            <CardDescription>
              Real-time status of AI processing stages
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
            {hasActiveProcessing && (
              <Badge className="bg-blue-100 text-blue-800 border-blue-200 animate-pulse">
                Processing
              </Badge>
            )}
            {isComplete && (
              <Badge className="bg-green-100 text-green-800 border-green-200">
                Complete
              </Badge>
            )}
            {hasErrors && (
              <Badge className="bg-red-100 text-red-800 border-red-200">
                Has Errors
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="font-medium">Overall Progress</span>
              <span className="text-gray-600">{calculateProgress()}%</span>
            </div>
            <Progress value={calculateProgress()} className="h-2" />
          </div>

          {hasActiveProcessing && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse" />
                  <span className="text-sm font-medium text-blue-900">
                    Processing in progress...
                  </span>
                </div>
                {getEstimatedCompletion() && (
                  <span className="text-sm text-blue-700">
                    Est. completion: {getEstimatedCompletion()}
                  </span>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Processing Steps */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Processing Steps</CardTitle>
          <CardDescription>
            Detailed view of each processing stage
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {data.processing_steps.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Monitor className="h-8 w-8 mx-auto mb-3 text-gray-400" />
                <p>No processing steps started yet</p>
                <p className="text-sm mt-1">Upload a script to begin processing</p>
              </div>
            ) : (
              data.processing_steps.map((step, index) => {
                const IconComponent = stepIcons[step.step] || Monitor
                const isExpanded = expandedSteps.has(step.id)
                const isRetrying = retryingSteps.has(step.id)

                return (
                  <Collapsible key={step.id} open={isExpanded} onOpenChange={() => toggleStepExpansion(step.id)}>
                    <div className="border rounded-lg p-4 hover:bg-gray-50 transition-colors">
                      <CollapsibleTrigger className="w-full">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                              <span className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-sm font-medium">
                                {index + 1}
                              </span>
                              <IconComponent className="h-5 w-5 text-gray-600" />
                            </div>
                            <div className="text-left">
                              <div className="flex items-center gap-3">
                                <h4 className="font-semibold capitalize">
                                  {step.step.replace('_', ' ')}
                                </h4>
                                {getStatusIcon(step.status)}
                                <Badge className={getStatusColor(step.status)}>
                                  {step.status}
                                </Badge>
                              </div>
                              <p className="text-sm text-gray-600 mt-1">
                                {stepDescriptions[step.step] || 'Processing step'}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {step.status === 'running' && (
                              <span className="text-sm text-blue-600">
                                {calculateDuration(step.started_at, null)}
                              </span>
                            )}
                            {step.status === 'completed' && (
                              <span className="text-sm text-green-600">
                                {calculateDuration(step.started_at, step.finished_at)}
                              </span>
                            )}
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 text-gray-400" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-gray-400" />
                            )}
                          </div>
                        </div>
                      </CollapsibleTrigger>

                      <CollapsibleContent className="mt-4 space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-12">
                          {/* Timing Information */}
                          <div className="space-y-2">
                            <h5 className="font-medium text-sm text-gray-700">Timing</h5>
                            <div className="text-sm space-y-1">
                              <div className="flex justify-between">
                                <span className="text-gray-600">Created:</span>
                                <span>{new Date(step.created_at).toLocaleString()}</span>
                              </div>
                              {step.started_at && (
                                <div className="flex justify-between">
                                  <span className="text-gray-600">Started:</span>
                                  <span>{new Date(step.started_at).toLocaleString()}</span>
                                </div>
                              )}
                              {step.finished_at && (
                                <div className="flex justify-between">
                                  <span className="text-gray-600">Finished:</span>
                                  <span>{new Date(step.finished_at).toLocaleString()}</span>
                                </div>
                              )}
                              {step.started_at && (
                                <div className="flex justify-between font-medium">
                                  <span className="text-gray-600">Duration:</span>
                                  <span>{calculateDuration(step.started_at, step.finished_at)}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Status Information */}
                          <div className="space-y-2">
                            <h5 className="font-medium text-sm text-gray-700">Status</h5>
                            <div className="text-sm space-y-1">
                              <div className="flex justify-between">
                                <span className="text-gray-600">Current Status:</span>
                                <Badge className={getStatusColor(step.status)} variant="outline">
                                  {step.status}
                                </Badge>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600">Retry Count:</span>
                                <span>{step.retry_count}</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Error Information */}
                        {step.error && (
                          <div className="pl-12">
                            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                              <h5 className="font-medium text-sm text-red-800 mb-2 flex items-center gap-2">
                                <XCircle className="h-4 w-4" />
                                Error Details
                              </h5>
                              <pre className="text-xs text-red-700 whitespace-pre-wrap font-mono">
                                {typeof step.error === 'string' ? step.error : JSON.stringify(step.error, null, 2)}
                              </pre>
                            </div>
                          </div>
                        )}

                        {/* Actions */}
                        {step.status === 'failed' && (
                          <div className="pl-12 pt-2 border-t">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleRetry(step.id)
                              }}
                              disabled={isRetrying}
                              className="text-orange-600 border-orange-300 hover:bg-orange-50"
                            >
                              {isRetrying ? (
                                <>
                                  <div className="w-4 h-4 border-2 border-orange-300 border-t-orange-600 rounded-full animate-spin mr-2" />
                                  Retrying...
                                </>
                              ) : (
                                <>
                                  <RotateCcw className="h-4 w-4 mr-2" />
                                  Retry Step
                                </>
                              )}
                            </Button>
                          </div>
                        )}
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                )
              })
            )}
          </div>
        </CardContent>
      </Card>

      {/* System Logs */}
      {data.processing_steps.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recent Activity</CardTitle>
            <CardDescription>
              System logs and processing events
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-64 overflow-auto">
              {data.processing_steps
                .filter(step => step.started_at || step.finished_at || step.error)
                .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                .slice(0, 10)
                .map((step, index) => (
                  <div key={`${step.id}-${index}`} className="flex items-center gap-3 text-sm p-2 rounded border-l-2 border-gray-200">
                    {getStatusIcon(step.status)}
                    <span className="flex-1">
                      <span className="font-medium capitalize">{step.step}</span> step {step.status}
                      {step.finished_at && (
                        <span className="text-gray-500 ml-2">
                          ({calculateDuration(step.started_at, step.finished_at)})
                        </span>
                      )}
                    </span>
                    <span className="text-gray-400 text-xs">
                      {new Date(step.finished_at || step.started_at || step.created_at).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}