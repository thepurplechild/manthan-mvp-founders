'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Upload, CheckCircle, ArrowRight, X, FileText, AlertCircle, RefreshCw, Plus } from 'lucide-react'

interface FileUpload {
  file: File
  id: string
  status: 'pending' | 'uploading' | 'queued' | 'running' | 'retrying' | 'succeeded' | 'failed'
  progress: number
  error?: string
  ingestionId?: string
  stuckRetryAttempted: boolean
  queuedSince: number | null
}

export default function ProjectUploadPage() {
  const params = useParams()
  const projectId = params.id as string
  const [files, setFiles] = useState<FileUpload[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropZoneRef = useRef<HTMLDivElement>(null)
  const activeIntervals = useRef<Map<string, NodeJS.Timeout>>(new Map())

  // Cleanup all intervals on unmount
  useEffect(() => {
    return () => {
      activeIntervals.current.forEach((interval) => {
        clearInterval(interval)
      })
      activeIntervals.current.clear()
    }
  }, [])

  // Drag and drop handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)

    const droppedFiles = Array.from(e.dataTransfer.files)
    addFiles(droppedFiles)
  }, [])

  const addFiles = (newFiles: File[]) => {
    const supportedTypes = ['.pdf', '.txt', '.docx']
    const validFiles = newFiles.filter(file => {
      const extension = '.' + file.name.split('.').pop()?.toLowerCase()
      return supportedTypes.includes(extension)
    })

    const fileUploads: FileUpload[] = validFiles.map(file => ({
      file,
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      status: 'pending',
      progress: 0,
      stuckRetryAttempted: false,
      queuedSince: null
    }))

    setFiles(prev => [...prev, ...fileUploads])
  }

  const removeFile = (fileId: string) => {
    setFiles(prev => prev.filter(f => f.id !== fileId))
  }

  const uploadFile = async (fileUpload: FileUpload) => {
    setFiles(prev => prev.map(f => 
      f.id === fileUpload.id 
        ? { ...f, status: 'uploading', progress: 0, error: undefined, stuckRetryAttempted: false, queuedSince: null }
        : f
    ))

    try {
      const fd = new FormData()
      fd.append('file', fileUpload.file)
      fd.append('project_id', projectId)
      
      const response = await fetch('/api/uploads', { method: 'POST', body: fd })
      const result = await response.json()

      if (!response.ok) {
        setFiles(prev => prev.map(f => 
          f.id === fileUpload.id 
            ? { ...f, status: 'failed', error: result.error || 'Upload failed' }
            : f
        ))
        return
      }

      setFiles(prev => prev.map(f => 
        f.id === fileUpload.id 
          ? { ...f, status: 'queued', progress: 10, ingestionId: result.ingestion_id, queuedSince: Date.now() }
          : f
      ))

      // Start polling for this specific file
      startPolling(fileUpload.id, result.ingestion_id)

    } catch (err) {
      setFiles(prev => prev.map(f => 
        f.id === fileUpload.id 
          ? { ...f, status: 'failed', error: 'Network error occurred' }
          : f
      ))
    }
  }

  const startPolling = (fileId: string, ingestionId: string) => {
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/ingestions/status?id=${ingestionId}`)
        if (response.ok) {
          const statusData = await response.json()
          const currentStatus = statusData.status || 'processing'
          const currentProgress = statusData.progress || 0

          setFiles(prev => prev.map(f => {
            if (f.id !== fileId) return f

            const updatedFile = { ...f, status: currentStatus, progress: currentProgress }

            // Track when ingestion first becomes queued and reset when not queued
            if (currentStatus === 'queued' && !f.queuedSince) {
              updatedFile.queuedSince = Date.now()
            } else if (currentStatus !== 'queued' && f.queuedSince) {
              updatedFile.queuedSince = null
            }

            // Auto-retry mechanism for stuck ingestions
            if (currentStatus === 'queued' && f.queuedSince && !f.stuckRetryAttempted) {
              const timeStuck = Date.now() - f.queuedSince
              if (timeStuck > 30000) { // 30 seconds
                console.log(`[upload] File ${f.file.name} stuck in queued status, attempting direct processing...`)
                updatedFile.stuckRetryAttempted = true
                updatedFile.status = 'retrying'

                // Trigger direct processing
                fetch('/api/ingestions/process-direct', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ ingestion_id: ingestionId })
                })
                .then(res => res.ok ? 
                  console.log(`[upload] Direct processing triggered for ${f.file.name}`) :
                  console.error(`[upload] Direct processing failed for ${f.file.name}`)
                )
                .catch(err => console.error(`[upload] Direct processing error for ${f.file.name}:`, err))
              }
            }

            return updatedFile
          }))

          // Stop polling if completed
          if (currentStatus === 'succeeded' || currentStatus === 'failed') {
            clearInterval(pollInterval)
            // Remove the interval reference from our tracking
            activeIntervals.current.delete(fileId)
          }
        }
      } catch (err) {
        console.error('Polling error:', err)
      }
    }, 2000)

    // Track interval for cleanup
    activeIntervals.current.set(fileId, pollInterval)

    // Cleanup interval after 5 minutes max
    setTimeout(() => {
      clearInterval(pollInterval)
      activeIntervals.current.delete(fileId)
    }, 5 * 60 * 1000)
  }

  const retryFile = (fileUpload: FileUpload) => {
    uploadFile(fileUpload)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'text-manthan-charcoal-600'
      case 'uploading': return 'text-manthan-saffron-600'
      case 'queued': return 'text-manthan-royal-600'
      case 'running': return 'text-manthan-gold-600'
      case 'retrying': return 'text-manthan-coral-600'
      case 'succeeded': return 'text-manthan-mint-600'
      case 'failed': return 'text-manthan-coral-600'
      default: return 'text-manthan-charcoal-600'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending': return <Upload className="w-4 h-4" />
      case 'uploading': return <div className="w-4 h-4 border-2 border-manthan-saffron-500 border-t-transparent rounded-full animate-spin" />
      case 'queued': case 'running': case 'retrying': return <div className="w-4 h-4 border-2 border-manthan-royal-500 border-t-transparent rounded-full animate-spin" />
      case 'succeeded': return <CheckCircle className="w-4 h-4" />
      case 'failed': return <AlertCircle className="w-4 h-4" />
      default: return <FileText className="w-4 h-4" />
    }
  }

  return (
    <div className="min-h-screen gradient-indian-bg">
      <div className="container mx-auto px-6 py-12">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="bg-gradient-to-br from-manthan-saffron-500 to-manthan-gold-500 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-indian">
              <Upload className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-4xl font-heading font-bold text-manthan-charcoal-800 mb-2">Upload Your Scripts</h1>
            <p className="text-manthan-charcoal-600">Drag and drop multiple script files or click to browse</p>
          </div>

          {/* Enhanced Drag & Drop Zone */}
          <div
            ref={dropZoneRef}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            className={`card-indian p-8 mb-6 transition-all duration-300 cursor-pointer ${
              isDragOver ? 'bg-manthan-saffron-50 border-manthan-saffron-400 border-2 border-dashed scale-105' : 'border-2 border-dashed border-manthan-saffron-200'
            }`}
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="text-center space-y-4">
              <div className={`w-20 h-20 rounded-2xl flex items-center justify-center mx-auto transition-all duration-300 ${
                isDragOver ? 'bg-manthan-saffron-500 scale-110' : 'bg-manthan-saffron-100'
              }`}>
                <Plus className={`w-10 h-10 transition-colors duration-300 ${
                  isDragOver ? 'text-white' : 'text-manthan-saffron-600'
                }`} />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-manthan-charcoal-800 mb-2">
                  {isDragOver ? 'Drop your files here' : 'Upload Script Files'}
                </h3>
                <p className="text-manthan-charcoal-600 mb-4">
                  Drag and drop files here, or click to browse your computer
                </p>
                <p className="text-sm text-manthan-charcoal-500">Supported formats: PDF, TXT, DOCX • Max size: 10MB per file</p>
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.txt,.docx"
              onChange={(e) => {
                if (e.target.files) {
                  addFiles(Array.from(e.target.files))
                }
              }}
              className="hidden"
            />
          </div>

          {/* File List */}
          {files.length > 0 && (
            <div className="card-indian p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-semibold text-manthan-charcoal-800">Files to Process</h3>
                <button
                  onClick={() => {
                    files.filter(f => f.status === 'pending').forEach(uploadFile)
                  }}
                  className="btn-indian text-sm px-4 py-2"
                  disabled={!files.some(f => f.status === 'pending')}
                >
                  Upload All Pending
                </button>
              </div>

              <div className="space-y-3">
                {files.map((fileUpload) => (
                  <div key={fileUpload.id} className="bg-manthan-ivory-50 rounded-xl p-4 border border-manthan-saffron-100">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-3">
                        <FileText className="w-5 h-5 text-manthan-charcoal-600" />
                        <span className="font-medium text-manthan-charcoal-800">{fileUpload.file.name}</span>
                        <span className="text-sm text-manthan-charcoal-500">
                          ({(fileUpload.file.size / 1024 / 1024).toFixed(1)} MB)
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <div className={`flex items-center space-x-1 ${getStatusColor(fileUpload.status)}`}>
                          {getStatusIcon(fileUpload.status)}
                          <span className="text-sm font-medium capitalize">{fileUpload.status}</span>
                        </div>
                        {fileUpload.status === 'pending' && (
                          <button
                            onClick={() => uploadFile(fileUpload)}
                            className="text-manthan-saffron-600 hover:text-manthan-saffron-700 p-1"
                            title="Upload file"
                          >
                            <Upload className="w-4 h-4" />
                          </button>
                        )}
                        {fileUpload.status === 'failed' && (
                          <button
                            onClick={() => retryFile(fileUpload)}
                            className="text-manthan-coral-600 hover:text-manthan-coral-700 p-1"
                            title="Retry upload"
                          >
                            <RefreshCw className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => removeFile(fileUpload.id)}
                          className="text-manthan-charcoal-400 hover:text-manthan-coral-600 p-1"
                          title="Remove file"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    {(fileUpload.status === 'uploading' || fileUpload.status === 'queued' || fileUpload.status === 'running' || fileUpload.status === 'retrying') && (
                      <div className="w-full bg-manthan-saffron-100 h-2 rounded-full overflow-hidden mb-2">
                        <div
                          className="h-full bg-gradient-to-r from-manthan-saffron-500 to-manthan-gold-500 rounded-full transition-all duration-500"
                          style={{ width: `${Math.max(fileUpload.progress, 10)}%` }}
                        />
                      </div>
                    )}

                    {/* Error Message */}
                    {fileUpload.error && (
                      <div className="text-sm text-manthan-coral-600 mt-2 flex items-center space-x-1">
                        <AlertCircle className="w-4 h-4" />
                        <span>{fileUpload.error}</span>
                      </div>
                    )}

                    {/* Success Actions */}
                    {fileUpload.status === 'succeeded' && fileUpload.ingestionId && (
                      <div className="mt-2">
                        <Link
                          href={`/ingestion/results?ingestionId=${fileUpload.ingestionId}`}
                          className="text-manthan-mint-600 hover:text-manthan-mint-700 text-sm font-medium flex items-center space-x-1"
                        >
                          <CheckCircle className="w-4 h-4" />
                          <span>View AI Processing Results</span>
                          <ArrowRight className="w-3 h-3" />
                        </Link>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="text-center mt-8">
            <Link
              href={`/projects/${projectId}`}
              className="btn-outline-indian inline-flex items-center gap-3"
            >
              Back to Project
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}