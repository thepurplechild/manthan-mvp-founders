"use client"
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { JSONValue } from '@/types/common'

export type StepStatus = 'queued'|'pending'|'running'|'failed'|'succeeded'|'skipped'|'completed'
export type StepName = 'core_extraction'|'character_bible'|'market_adaptation'|'package_assembly'|'visuals'|'final_package'|'script_preprocess'

export interface PipelineStep {
  name: StepName
  status: StepStatus
  startedAt?: string
  finishedAt?: string
  output?: JSONValue
  error?: string
}

export interface PipelineState {
  ingestionId?: string
  projectId?: string
  progress: number
  status: string
  steps: PipelineStep[]
  error?: string | null
  assets?: Array<{
    storage_path?: string
    kind?: string
  }>
}

export function usePipelineProgress(projectId: string | undefined) {
  const supabase = useMemo(() => createClient(), [])
  const [state, setState] = useState<PipelineState | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [ingestionId, setIngestionId] = useState<string | null>(null)

  const fetchStatus = useCallback(async () => {
    if (!projectId && !ingestionId) return null
    const params = new URLSearchParams()
    if (ingestionId) params.set('ingestionId', ingestionId)
    else if (projectId) params.set('projectId', projectId)

    try {
      const res = await fetch(`/api/pipeline-status?${params.toString()}`, { cache: 'no-store' })
      if (!res.ok) throw new Error(`Status ${res.status}`)
      const json = await res.json()
      const payload = json.data as PipelineState | undefined
      if (payload) {
        setState(payload)
        if (payload.ingestionId) setIngestionId(payload.ingestionId)
      }
      return payload ?? null
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
      return null
    }
  }, [projectId, ingestionId])

  const start = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/process-script', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId }) })
      if (!res.ok) throw new Error(`Start failed: ${res.status}`)
      const json = await res.json()
      if (json?.ingestionId) setIngestionId(json.ingestionId)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    if (!projectId) return
    let mounted = true
    ;(async () => {
      const current = await fetchStatus()
      if (!current || current.status !== 'completed') {
        await start()
      }
      if (pollRef.current) clearInterval(pollRef.current)
      pollRef.current = setInterval(async () => {
        const s = await fetchStatus()
        const done = s && (s.status === 'completed' || s.status === 'failed')
        if (done && s) {
          if (pollRef.current) clearInterval(pollRef.current)
        }
      }, 2000)
    })()
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [projectId, start, fetchStatus])

  const getSignedUrl = useCallback(async (path: string, expiresIn = 3600) => {
    const { data, error } = await supabase.storage.from('generated-assets').createSignedUrl(path, expiresIn)
    if (error) throw error
    return data.signedUrl
  }, [supabase])

  const retry = useCallback(async () => {
    await start()
  }, [start])

  return { state, loading, error, start, retry, getSignedUrl }
}
