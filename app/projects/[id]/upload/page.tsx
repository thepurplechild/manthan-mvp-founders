'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Upload, CheckCircle, ArrowRight, ArrowLeft, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface Project {
  id: string
  title: string
  owner_id: string
  status: string
}

export default function ProjectUploadPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params?.id as string

  // Project state
  const [project, setProject] = useState<Project | null>(null)
  const [projectLoading, setProjectLoading] = useState(true)
  const [projectError, setProjectError] = useState<string | null>(null)

  // Upload state
  const [file, setFile] = useState<File | null>(null)
  const [ingestionId, setIngestionId] = useState<string | null>(null)
  const [progress, setProgress] = useState<number>(0)
  const [status, setStatus] = useState<string>('idle')
  const [error, setError] = useState<string | null>(null)
  const [stuckRetryAttempted, setStuckRetryAttempted] = useState(false)
  const [queuedSince, setQueuedSince] = useState<number | null>(null)
  const [pollInterval, setPollInterval] = useState(2000)
  const [retryCount, setRetryCount] = useState(0)
  const [maxRetries] = useState(5)

  // Load project data
  useEffect(() => {
    async function loadProject() {
      try {
        const supabase = createClient()

        // Get authenticated user
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
          setProjectError('Authentication required')
          return
        }

        // Load project data
        const { data: projectData, error: projectLoadError } = await supabase
          .from('projects')
          .select('id, title, owner_id, status')
          .eq('id', projectId)
          .single()

        if (projectLoadError) {
          console.error('Project load error:', projectLoadError)
          if (projectLoadError.code === 'PGRST116') {
            setProjectError('Project not found')
          } else {
            setProjectError('Failed to load project')
          }
          return
        }

        if (!projectData) {
          setProjectError('Project not found')
          return
        }

        if (projectData.owner_id !== user.id) {
          setProjectError('Access denied - you do not own this project')
          return
        }

        setProject(projectData)
      } catch (err) {
        console.error('Failed to load project:', err)
        setProjectError('Failed to load project')
      } finally {
        setProjectLoading(false)
      }
    }

    if (projectId) {
      loadProject()
    }
  }, [projectId])

  // Status polling effect (same as original but with projectId context)
  useEffect(() => {
    let timer: NodeJS.Timeout | undefined
    if (ingestionId && project) {
      const pollStatus = async () => {
        try {
          console.log(`[project-upload] Polling status for project ${project.id} (interval: ${pollInterval}ms, retry: ${retryCount}/${maxRetries})`)
          const r = await fetch(`/api/ingestions/status?id=${ingestionId}`)

          if (r.ok) {
            const j = await r.json()
            const currentStatus = j.status || 'processing'
            const currentProgress = j.progress || 0

            setProgress(currentProgress)
            setStatus(currentStatus)
            setRetryCount(0)

            // Track queued state with project context
            if (currentStatus === 'queued' && !queuedSince) {
              setQueuedSince(Date.now())
              console.log(`[project-upload] Ingestion for project ${project.id} entered queued state`)
            } else if (currentStatus !== 'queued' && queuedSince) {
              setQueuedSince(null)
              console.log(`[project-upload] Ingestion for project ${project.id} left queued state, now: ${currentStatus}`)
            }

            // Adjust polling frequency
            if (currentStatus === 'processing' || currentStatus === 'running') {
              setPollInterval(3000)
            } else if (currentStatus === 'queued') {
              setPollInterval(Math.min(pollInterval * 1.2, 10000))
            } else {
              setPollInterval(2000)
            }

            // Enhanced auto-retry with project context
            if (currentStatus === 'queued' && queuedSince && !stuckRetryAttempted) {
              const timeStuck = Date.now() - queuedSince

              if (timeStuck > 15000 && timeStuck < 45000) {
                console.log(`[project-upload] Project ${project.id} ingestion queued for ${Math.round(timeStuck/1000)}s - may be experiencing delays`)
              } else if (timeStuck > 45000) {
                console.log(`[project-upload] Project ${project.id} ingestion stuck, attempting direct processing...`)
                setStuckRetryAttempted(true)
                setStatus('retrying')

                try {
                  const retryRes = await fetch('/api/ingestions/process-direct', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      ingestion_id: ingestionId,
                      project_id: project.id
                    })
                  })

                  if (retryRes.ok) {
                    console.log(`[project-upload] Direct processing triggered for project ${project.id}`)
                    setProgress(25)
                    setStatus('processing')
                  } else {
                    const retryError = await retryRes.json()
                    console.error(`[project-upload] Direct processing failed for project ${project.id}:`, retryError)

                    if (retryRes.status === 400) {
                      setStuckRetryAttempted(false)
                    } else if (retryRes.status === 429) {
                      setStuckRetryAttempted(false)
                      setPollInterval(15000)
                    } else {
                      setError(`Processing stuck - retry failed (${retryRes.status}). Please try uploading again.`)
                      setStatus('failed')
                    }
                  }
                } catch (retryErr) {
                  console.error(`[project-upload] Direct processing request failed for project ${project.id}:`, retryErr)
                  setError('Processing stuck - network error during retry. Please try uploading again.')
                  setStatus('failed')
                }
              }
            }

            if (currentStatus === 'succeeded' || currentStatus === 'failed') {
              if (timer) clearInterval(timer)
            }
          } else {
            // Enhanced error handling with retry logic
            console.warn(`[project-upload] Status API returned error for project ${project.id}:`, r.status)

            if (retryCount < maxRetries) {
              setRetryCount(prev => prev + 1)
              setPollInterval(Math.min(pollInterval * 1.5, 30000))
            } else {
              console.error(`[project-upload] Max retries reached for project ${project.id}`)
              if (timer) clearInterval(timer)

              if (r.status === 404) {
                setError('Upload session expired. Please try uploading again.')
                setStatus('failed')
              } else if (r.status >= 500) {
                setError('Server error. Please wait a moment and try uploading again.')
                setStatus('failed')
              } else {
                setError(`API error (${r.status}). Please try uploading again.`)
                setStatus('failed')
              }
            }
          }
        } catch (fetchError) {
          console.warn(`[project-upload] Network error during status check for project ${project.id}:`, fetchError)

          if (retryCount < maxRetries) {
            setRetryCount(prev => prev + 1)
            setPollInterval(Math.min(pollInterval * 1.5, 30000))
          } else {
            console.error(`[project-upload] Max network retries reached for project ${project.id}`)
            if (timer) clearInterval(timer)
            setError('Network connection issues. Please check your connection and try again.')
            setStatus('failed')
          }
        }
      }

      pollStatus()
      timer = setInterval(pollStatus, pollInterval)
    }
    return () => { if (timer) clearInterval(timer) }
  }, [ingestionId, project, pollInterval, retryCount, maxRetries, queuedSince, stuckRetryAttempted])

  const upload = async () => {
    if (!file || !project) return

    setError(null)
    setStuckRetryAttempted(false)
    setQueuedSince(null)
    setStatus('uploading')
    setProgress(0)

    try {
      console.log(`[project-upload] Starting upload for project ${project.id}`)

      const fd = new FormData()
      fd.append('file', file)
      fd.append('project_id', project.id) // Critical: pass project ID

      const r = await fetch('/api/uploads', { method: 'POST', body: fd })
      const j = await r.json()

      if (!r.ok) {
        console.error(`[project-upload] Upload failed for project ${project.id}:`, j)
        setError(j.error || 'Upload failed')
        setStatus('failed')
        return
      }

      console.log(`[project-upload] Upload successful for project ${project.id}, ingestion ID: ${j.ingestion_id}`)
      setIngestionId(j.ingestion_id)
      setStatus('queued')
      setProgress(10)
    } catch (err) {
      console.error(`[project-upload] Network error for project ${project.id}:`, err)
      setError('Network error occurred')
      setStatus('failed')
    }
  }

  const isComplete = status === 'succeeded'
  const isFailed = status === 'failed'
  const isProcessing = status === 'queued' || status === 'running' || status === 'uploading' || status === 'retrying'

  // Show loading state while loading project
  if (projectLoading) {
    return (
      <div className="min-h-screen gradient-indian-bg">
        <div className="container mx-auto px-6 py-12">
          <div className="max-w-2xl mx-auto text-center">
            <div className="animate-spin w-8 h-8 border-3 border-manthan-saffron-200 border-t-manthan-saffron-500 rounded-full mx-auto mb-4"></div>
            <p className="text-manthan-charcoal-600">Loading project...</p>
          </div>
        </div>
      </div>
    )
  }

  // Show error state if project loading failed
  if (projectError) {
    return (
      <div className="min-h-screen gradient-indian-bg">
        <div className="container mx-auto px-6 py-12">
          <div className="max-w-2xl mx-auto">
            <div className="card-indian p-8 text-center">
              <div className="bg-manthan-coral-100 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-8 h-8 text-manthan-coral-600" />
              </div>
              <h1 className="text-2xl font-heading font-bold text-manthan-charcoal-800 mb-4">
                Unable to Load Project
              </h1>
              <p className="text-manthan-charcoal-600 mb-6">{projectError}</p>
              <div className="flex gap-4 justify-center">
                <button
                  onClick={() => router.back()}
                  className="btn-outline-indian flex items-center gap-2"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Go Back
                </button>
                <Link href="/projects" className="btn-indian flex items-center gap-2">
                  View All Projects
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen gradient-indian-bg">
      <div className="container mx-auto px-6 py-12">
        <div className="max-w-2xl mx-auto">
          {/* Header with Project Context */}
          <div className="text-center mb-8">
            <div className="bg-gradient-to-br from-manthan-saffron-500 to-manthan-gold-500 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-indian">
              <Upload className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-4xl font-heading font-bold text-manthan-charcoal-800 mb-2">
              Upload Script
            </h1>
            <p className="text-manthan-charcoal-600 mb-2">
              Upload a script for: <span className="font-semibold text-manthan-charcoal-800">{project?.title}</span>
            </p>
            <p className="text-sm text-manthan-charcoal-500">
              Transform your story into a professional pitch deck with AI
            </p>
          </div>

          {/* Breadcrumb Navigation */}
          <div className="flex items-center gap-2 text-sm text-manthan-charcoal-600 mb-6">
            <Link href="/projects" className="hover:text-manthan-saffron-600">Projects</Link>
            <span>/</span>
            <Link href={`/projects/${project?.id}`} className="hover:text-manthan-saffron-600">
              {project?.title}
            </Link>
            <span>/</span>
            <span className="text-manthan-charcoal-800 font-medium">Upload</span>
          </div>

          {/* Upload Form */}
          <div className="card-indian p-8 mb-6">
            <div className="space-y-6">
              <div>
                <label className="block text-manthan-charcoal-700 font-medium mb-2">
                  Select Your Script File
                </label>
                <input
                  type="file"
                  accept=".pdf,.txt,.docx"
                  onChange={e => setFile(e.target.files?.[0] || null)}
                  className="w-full p-3 border-2 border-manthan-saffron-200 rounded-xl focus:border-manthan-saffron-500 transition-colors"
                  disabled={isProcessing}
                />
                <p className="text-sm text-manthan-charcoal-600 mt-1">
                  Supported formats: PDF, TXT, DOCX (max 10MB)
                </p>
              </div>

              <button
                className="btn-indian w-full flex items-center justify-center gap-3 py-4"
                disabled={!file || isProcessing || !project}
                onClick={upload}
              >
                <Upload className="w-5 h-5" />
                {isProcessing ? 'Processing...' : 'Upload & Start AI Processing'}
              </button>
            </div>
          </div>

          {/* Error Display */}
          {error && (
            <div className="bg-manthan-coral-50 border border-manthan-coral-200 rounded-xl p-4 mb-6">
              <p className="text-manthan-coral-800 font-medium">{error}</p>
            </div>
          )}

          {/* Processing Status - Same as original with project context */}
          {ingestionId && (
            <div className="card-indian p-6">
              <div className="text-center">
                {isProcessing && (
                  <>
                    <div className="animate-spin w-8 h-8 border-3 border-manthan-saffron-200 border-t-manthan-saffron-500 rounded-full mx-auto mb-4"></div>
                    <h3 className="text-xl font-semibold text-manthan-charcoal-800 mb-2">Processing Your Script</h3>
                    <p className="text-manthan-charcoal-600 mb-4">
                      Our AI is analyzing "{project?.title}" content and preparing the pitch materials...
                    </p>
                  </>
                )}

                {isComplete && (
                  <>
                    <div className="bg-manthan-mint-100 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4">
                      <CheckCircle className="w-8 h-8 text-manthan-mint-600" />
                    </div>
                    <h3 className="text-2xl font-semibold text-manthan-charcoal-800 mb-2">Upload Complete!</h3>
                    <p className="text-manthan-charcoal-600 mb-6">
                      Your script for "{project?.title}" has been processed and is ready for review.
                    </p>
                  </>
                )}

                {isFailed && (
                  <>
                    <div className="bg-manthan-coral-100 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4">
                      <Upload className="w-8 h-8 text-manthan-coral-600" />
                    </div>
                    <h3 className="text-xl font-semibold text-manthan-charcoal-800 mb-2">Processing Failed</h3>
                    <p className="text-manthan-charcoal-600 mb-4">There was an issue processing your file. Please try again.</p>
                  </>
                )}

                {/* Progress Bar */}
                <div className="w-full bg-manthan-saffron-100 h-3 rounded-full overflow-hidden mb-4">
                  <div
                    className="h-full bg-gradient-to-r from-manthan-saffron-500 to-manthan-gold-500 rounded-full transition-all duration-500"
                    style={{ width: `${Math.max(progress, isProcessing ? 30 : 0)}%` }}
                  />
                </div>

                <div className="text-sm text-manthan-charcoal-600 mb-6 space-y-1">
                  <p>
                    Status: <span className="font-medium capitalize">{status}</span> • {Math.max(progress, isProcessing ? 30 : 0)}%
                  </p>
                  {queuedSince && (
                    <p className="text-xs text-manthan-charcoal-500">
                      Queued for {Math.round((Date.now() - queuedSince) / 1000)}s
                      {Math.round((Date.now() - queuedSince) / 1000) > 15 && ' - experiencing delays'}
                    </p>
                  )}
                  {status === 'retrying' && (
                    <p className="text-xs text-manthan-saffron-600">
                      Attempting alternative processing method...
                    </p>
                  )}
                  {retryCount > 0 && status !== 'retrying' && (
                    <p className="text-xs text-manthan-charcoal-500">
                      Connection retry {retryCount}/{maxRetries}
                    </p>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex gap-4 justify-center">
                  {isComplete && (
                    <Link
                      href={`/projects/${project?.id}/results?ingestionId=${ingestionId}` as any}
                      className="btn-indian inline-flex items-center gap-3 text-lg px-8 py-4"
                    >
                      View AI Processing Results
                      <ArrowRight className="w-5 h-5" />
                    </Link>
                  )}

                  {(isFailed || isComplete) && (
                    <Link
                      href={`/projects/${project?.id}`}
                      className="btn-outline-indian inline-flex items-center gap-3"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      Back to Project
                    </Link>
                  )}

                  {isFailed && (
                    <button
                      onClick={() => {
                        setStatus('idle')
                        setError(null)
                        setIngestionId(null)
                        setProgress(0)
                      }}
                      className="btn-indian inline-flex items-center gap-3"
                    >
                      Try Again
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Back Navigation */}
          <div className="text-center mt-8">
            <Link
              href={`/projects/${project?.id}`}
              className="text-manthan-charcoal-600 hover:text-manthan-saffron-600 text-sm inline-flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to {project?.title}
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}