'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { createClient } from '@/lib/supabase/client'
import type { ProjectOverviewResponse } from '@/types/projects'

interface UseProjectDashboardOptions {
  initialData?: ProjectOverviewResponse | null
  enableRealtime?: boolean
  pollIntervalMs?: number
}

interface UseProjectDashboardReturn {
  overview: ProjectOverviewResponse | null
  isLoading: boolean
  isRefreshing: boolean
  error: string | null
  lastUpdated: string | null
  refresh: () => Promise<void>
}

export function useProjectDashboard(
  projectId: string,
  options: UseProjectDashboardOptions = {}
): UseProjectDashboardReturn {
  const {
    initialData = null,
    enableRealtime = true,
    pollIntervalMs = 60000,
  } = options

  const [overview, setOverview] = useState<ProjectOverviewResponse | null>(initialData)
  const [isLoading, setIsLoading] = useState<boolean>(!initialData)
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<string | null>(
    initialData ? new Date().toISOString() : null
  )

  const refreshDebounceRef = useRef<NodeJS.Timeout | null>(null)
  const mountedRef = useRef<boolean>(false)

  const refresh = useCallback(async () => {
    setIsRefreshing(true)
    if (!mountedRef.current) {
      setIsLoading(true)
    }

    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: 'GET',
        cache: 'no-store',
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: 'Failed to load project overview' }))
        const message = payload.error || `Request failed (${response.status})`
        setError(message)
        return
      }

      const data = (await response.json()) as ProjectOverviewResponse
      setOverview(data)
      setError(null)
      setLastUpdated(new Date().toISOString())
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load project overview'
      setError(message)
      console.error('[useProjectDashboard] refresh failed', err)
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [projectId])

  const scheduleRefresh = useCallback(() => {
    if (refreshDebounceRef.current) return

    refreshDebounceRef.current = setTimeout(async () => {
      refreshDebounceRef.current = null
      await refresh()
    }, 400)
  }, [refresh])

  // Initial load if no data provided
  useEffect(() => {
    mountedRef.current = true
    if (!initialData) {
      refresh()
    }

    return () => {
      mountedRef.current = false
      if (refreshDebounceRef.current) {
        clearTimeout(refreshDebounceRef.current)
      }
    }
  }, [initialData, refresh])

  // Supabase realtime subscription
  useEffect(() => {
    if (!enableRealtime) return undefined

    const supabase = createClient()
    const channel = supabase
      .channel(`project-dashboard-${projectId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ingestions', filter: `project_id=eq.${projectId}` },
        scheduleRefresh
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'script_uploads', filter: `project_id=eq.${projectId}` },
        scheduleRefresh
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'generated_assets', filter: `project_id=eq.${projectId}` },
        scheduleRefresh
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [projectId, enableRealtime, scheduleRefresh])

  // Polling fallback / heartbeat refresh
  useEffect(() => {
    if (pollIntervalMs <= 0) return undefined

    const interval = setInterval(() => {
      refresh()
    }, pollIntervalMs)

    return () => clearInterval(interval)
  }, [pollIntervalMs, refresh])

  // Derived state ensures we expose the latest values even if overview is null
  const state = useMemo(() => ({
    overview,
    isLoading,
    isRefreshing,
    error,
    lastUpdated,
    refresh,
  }), [overview, isLoading, isRefreshing, error, lastUpdated, refresh])

  return state
}
