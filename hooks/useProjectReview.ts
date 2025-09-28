'use client'

import { useState, useCallback, useRef, useEffect } from 'react'

import { createClient } from '@/lib/supabase/client'
import type { ProjectReviewData } from '@/types/review'

interface RevisionRequest {
  feedback: string
  categories: string[]
  priority: 'low' | 'medium' | 'high'
  deadline?: string
}

interface UseProjectReviewReturn {
  data: ProjectReviewData
  isLoading: boolean
  isRefreshing: boolean
  error: string | null
  updateProject: (updates: { title?: string; description?: string }) => Promise<void>
  approveProject: (feedback?: string) => Promise<void>
  requestRevisions: (revisions: RevisionRequest) => Promise<void>
  submitFeedback: (feedback: string, rating?: number) => Promise<void>
  retryProcessing: (stepId: string) => Promise<void>
  refreshData: () => Promise<void>
}

export function useProjectReview(initialData: ProjectReviewData): UseProjectReviewReturn {
  const [data, setData] = useState<ProjectReviewData>(initialData)
  const [isLoading, setIsLoading] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const refreshTimeoutRef = useRef<NodeJS.Timeout>()
  const realtimeChannelRef = useRef<ReturnType<typeof createClient>['channel'] | null>(null)

  const apiCall = useCallback(async (url: string, options: RequestInit = {}) => {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Network error' }))
      throw new Error(errorData.message || `HTTP ${response.status}`)
    }

    return response.json()
  }, [])

  const refreshData = useCallback(async () => {
    if (isRefreshing) return

    setIsRefreshing(true)
    if (!isLoading) {
      setIsLoading(true)
    }
    setError(null)

    try {
      const updatedData = await apiCall(`/api/projects/${data.project.id}/review`)
      setData(updatedData)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to refresh data'
      setError(errorMessage)
      console.error('Failed to refresh project data:', err)
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [data.project.id, apiCall, isLoading, isRefreshing])

  const scheduleRefresh = useCallback(() => {
    if (refreshTimeoutRef.current) return

    refreshTimeoutRef.current = setTimeout(async () => {
      refreshTimeoutRef.current = undefined
      await refreshData()
    }, 400)
  }, [refreshData])

  const updateProject = useCallback(async (updates: { title?: string; description?: string }) => {
    setError(null)

    try {
      const updatedProject = await apiCall(`/api/projects/${data.project.id}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      })

      // Optimistically update the local state
      setData(prev => ({
        ...prev,
        project: {
          ...prev.project,
          ...updatedProject,
          updated_at: new Date().toISOString()
        }
      }))
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update project'
      setError(errorMessage)
      throw err
    }
  }, [data.project.id, apiCall])

  const approveProject = useCallback(async (feedback?: string) => {
    setError(null)

    try {
      await apiCall(`/api/projects/${data.project.id}/approve`, {
        method: 'POST',
        body: JSON.stringify({
          feedback: feedback || null,
          approved_at: new Date().toISOString()
        }),
      })

      // Update the approval status
      setData(prev => ({
        ...prev,
        approval_status: {
          ...prev.approval_status,
          approved: true,
          approved_at: new Date().toISOString(),
          approved_by: 'Current User', // Would be actual user in real implementation
          feedback: feedback ? [...prev.approval_status.feedback, {
            id: Date.now().toString(),
            text: feedback,
            created_at: new Date().toISOString(),
            author: 'Current User'
          }] : prev.approval_status.feedback
        },
        project: {
          ...prev.project,
          status: 'approved',
          updated_at: new Date().toISOString()
        }
      }))
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to approve project'
      setError(errorMessage)
      throw err
    }
  }, [data.project.id, apiCall])

  const requestRevisions = useCallback(async (revisions: RevisionRequest) => {
    setError(null)

    try {
      await apiCall(`/api/projects/${data.project.id}/revisions`, {
        method: 'POST',
        body: JSON.stringify({
          ...revisions,
          requested_at: new Date().toISOString()
        }),
      })

      // Update the revision requests
      setData(prev => ({
        ...prev,
        approval_status: {
          ...prev.approval_status,
          revision_requests: [
            ...prev.approval_status.revision_requests,
            {
              id: Date.now().toString(),
              ...revisions,
              created_at: new Date().toISOString(),
              status: 'pending'
            }
          ]
        },
        project: {
          ...prev.project,
          status: 'revision_requested',
          updated_at: new Date().toISOString()
        }
      }))
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to request revisions'
      setError(errorMessage)
      throw err
    }
  }, [data.project.id, apiCall])

  const submitFeedback = useCallback(async (feedback: string, rating?: number) => {
    setError(null)

    try {
      await apiCall(`/api/projects/${data.project.id}/feedback`, {
        method: 'POST',
        body: JSON.stringify({
          feedback,
          rating: rating || null,
          submitted_at: new Date().toISOString()
        }),
      })

      // Add feedback to local state
      setData(prev => ({
        ...prev,
        approval_status: {
          ...prev.approval_status,
          feedback: [
            ...prev.approval_status.feedback,
            {
              id: Date.now().toString(),
              text: feedback,
              rating: rating || null,
              created_at: new Date().toISOString(),
              author: 'Current User'
            }
          ]
        }
      }))
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to submit feedback'
      setError(errorMessage)
      throw err
    }
  }, [data.project.id, apiCall])

  const retryProcessing = useCallback(async (stepId: string) => {
    setError(null)

    try {
      await apiCall(`/api/jobs/${stepId}/retry`, {
        method: 'POST',
        body: JSON.stringify({
          force: true,
          reset_retry_count: false
        }),
      })

      // Optimistically update the step status
      setData(prev => ({
        ...prev,
        processing_steps: prev.processing_steps.map(step =>
          step.id === stepId
            ? {
                ...step,
                status: 'pending',
                started_at: null,
                finished_at: null,
                error: null,
                retry_count: step.retry_count + 1
              }
            : step
        )
      }))

      // Schedule a refresh to get updated status
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current)
      }
      refreshTimeoutRef.current = setTimeout(refreshData, 2000)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to retry processing step'
      setError(errorMessage)
      throw err
    }
  }, [apiCall, refreshData])

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`project-review-${data.project.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ingestions', filter: `project_id=eq.${data.project.id}` }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'generated_assets', filter: `project_id=eq.${data.project.id}` }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'generated_content', filter: `project_id=eq.${data.project.id}` }, scheduleRefresh)
      .subscribe()

    realtimeChannelRef.current = channel

    return () => {
      if (realtimeChannelRef.current) {
        supabase.removeChannel(realtimeChannelRef.current)
      }
      realtimeChannelRef.current = null
    }
  }, [data.project.id, scheduleRefresh])

  useEffect(() => {
    const interval = setInterval(() => {
      refreshData()
    }, 90000)

    return () => clearInterval(interval)
  }, [refreshData])

  useEffect(() => () => {
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current)
    }
  }, [])

  return {
    data,
    isLoading,
    isRefreshing,
    error,
    updateProject,
    approveProject,
    requestRevisions,
    submitFeedback,
    retryProcessing,
    refreshData,
  }
}
