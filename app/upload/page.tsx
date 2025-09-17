'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Upload, CheckCircle, ArrowRight } from 'lucide-react'

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null)
  const [ingestionId, setIngestionId] = useState<string | null>(null)
  const [projectId, setProjectId] = useState<string | null>(null)
  const [progress, setProgress] = useState<number>(0)
  const [status, setStatus] = useState<string>('idle')
  const [error, setError] = useState<string | null>(null)
  const [stuckRetryAttempted, setStuckRetryAttempted] = useState(false)
  const [queuedSince, setQueuedSince] = useState<number | null>(null)

  useEffect(() => {
    let timer: NodeJS.Timeout | undefined
    if (ingestionId) {
      // Poll ingestion status every 4s (reduced from 2s to reduce server load)
      timer = setInterval(async () => {
        try {
          const r = await fetch(`/api/ingestions/status?id=${ingestionId}`)
          if (r.ok) {
          const j = await r.json()
          const currentStatus = j.status || 'processing'
          setProgress(j.progress || 0)
          setStatus(currentStatus)
          
          // Track when ingestion first becomes queued and reset when not queued
          if (currentStatus === 'queued' && !queuedSince) {
            setQueuedSince(Date.now())
          } else if (currentStatus !== 'queued' && queuedSince) {
            setQueuedSince(null) // Reset timer when no longer queued
          }
          
          // Extract project_id for navigation when complete
          if (j.project_id && !projectId) {
            setProjectId(j.project_id)
          }
          
          // Auto-retry mechanism: if stuck in "queued" for more than 30 seconds, try direct processing
          if (currentStatus === 'queued' && queuedSince && !stuckRetryAttempted) {
            const timeStuck = Date.now() - queuedSince
            if (timeStuck > 30000) { // 30 seconds
              console.log('[upload] Ingestion stuck in queued status for', timeStuck, 'ms, attempting direct processing...')
              setStuckRetryAttempted(true)
              setStatus('retrying')
              
              try {
                const retryRes = await fetch('/api/ingestions/process-direct', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ ingestion_id: ingestionId })
                })
                
                if (retryRes.ok) {
                  console.log('[upload] Direct processing triggered successfully')
                  setProgress(40) // Show some progress
                } else {
                  const retryError = await retryRes.json()
                  console.error('[upload] Direct processing failed:', retryError)
                  
                  // Don't mark as failed for benign errors (400 = not queued anymore)
                  if (retryRes.status === 400) {
                    console.log('[upload] Ingestion no longer queued - likely processing normally')
                    // Keep current status, ingestion may have started processing
                  } else {
                    setError('Processing stuck - retry failed. Please try uploading again.')
                    setStatus('failed')
                  }
                }
              } catch (retryErr) {
                console.error('[upload] Direct processing request failed:', retryErr)
                setError('Processing stuck - retry failed. Please try uploading again.')
                setStatus('failed')
              }
            }
          }
          
          if (currentStatus === 'succeeded' || currentStatus === 'failed') {
            if (timer) clearInterval(timer)
          }
        } else {
          // Stop polling on HTTP errors to reduce server load
          console.warn('[upload] Status API returned error, stopping polling:', r.status)
          if (timer) clearInterval(timer)
          if (r.status === 404) {
            setError('Upload session expired. Please try uploading again.')
            setStatus('failed')
          }
        }
        } catch (fetchError) {
          console.warn('[upload] Network error during status check:', fetchError)
          // Don't stop polling on network errors, just log them
        }
      }, 4000) // Changed from 2000ms to 4000ms
    }
    return () => { if (timer) clearInterval(timer) }
  }, [ingestionId, projectId, queuedSince, stuckRetryAttempted])

  const upload = async () => {
    setError(null)
    if (!file) return
    
    // Reset retry state for new upload
    setStuckRetryAttempted(false)
    setQueuedSince(null)
    
    setStatus('uploading')
    setProgress(0)
    
    try {
      const fd = new FormData()
      fd.append('file', file)
      const r = await fetch('/api/uploads', { method: 'POST', body: fd })
      const j = await r.json()
      
      if (!r.ok) { 
        setError(j.error || 'Upload failed')
        setStatus('failed')
        return 
      }
      
      setIngestionId(j.ingestion_id)
      setStatus('queued')
      setProgress(10)
    } catch (err) {
      setError('Network error occurred')
      setStatus('failed')
    }
  }

  const isComplete = status === 'succeeded'
  const isFailed = status === 'failed'
  const isProcessing = status === 'queued' || status === 'running' || status === 'uploading' || status === 'retrying'
  
  return (
    <div className="min-h-screen gradient-indian-bg">
      <div className="container mx-auto px-6 py-12">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="bg-gradient-to-br from-manthan-saffron-500 to-manthan-gold-500 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-indian">
              <Upload className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-4xl font-heading font-bold text-manthan-charcoal-800 mb-2">Upload Your Script</h1>
            <p className="text-manthan-charcoal-600">Transform your story into a professional pitch deck with AI</p>
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
                <p className="text-sm text-manthan-charcoal-600 mt-1">Supported formats: PDF, TXT, DOCX</p>
              </div>
              
              <button 
                className="btn-indian w-full flex items-center justify-center gap-3 py-4" 
                disabled={!file || isProcessing} 
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

          {/* Processing Status */}
          {ingestionId && (
            <div className="card-indian p-6">
              <div className="text-center">
                {isProcessing && (
                  <>
                    <div className="animate-spin w-8 h-8 border-3 border-manthan-saffron-200 border-t-manthan-saffron-500 rounded-full mx-auto mb-4"></div>
                    <h3 className="text-xl font-semibold text-manthan-charcoal-800 mb-2">Processing Your Script</h3>
                    <p className="text-manthan-charcoal-600 mb-4">Our AI is analyzing your content and preparing the pitch materials...</p>
                  </>
                )}
                
                {isComplete && (
                  <>
                    <div className="bg-manthan-mint-100 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4">
                      <CheckCircle className="w-8 h-8 text-manthan-mint-600" />
                    </div>
                    <h3 className="text-2xl font-semibold text-manthan-charcoal-800 mb-2">Upload Complete!</h3>
                    <p className="text-manthan-charcoal-600 mb-6">Your script has been processed and is ready for AI transformation.</p>
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
                
                <p className="text-sm text-manthan-charcoal-600 mb-6">
                  Status: <span className="font-medium capitalize">{status}</span> • {Math.max(progress, isProcessing ? 30 : 0)}%
                </p>
                
                {/* Action Button */}
                {isComplete && ingestionId && (
                  <Link 
                    href={`/ingestion/results?${projectId ? `projectId=${projectId}` : `ingestionId=${ingestionId}`}`}
                    className="btn-indian inline-flex items-center gap-3 text-lg px-8 py-4"
                  >
                    View AI Processing Results
                    <ArrowRight className="w-5 h-5" />
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
                    className="btn-outline-indian inline-flex items-center gap-3"
                  >
                    Try Again
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Enhanced Upload Link */}
          <div className="text-center mt-8">
            <Link 
              href="/projects/new" 
              className="text-manthan-charcoal-600 hover:text-manthan-saffron-600 text-sm"
            >
              Need advanced upload features? Try our enhanced project upload →
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}