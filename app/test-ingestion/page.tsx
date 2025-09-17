'use client'

import { useState } from 'react'
import { IngestionResult, IngestionProgress, IngestionErrorType } from '@/lib/ingestion/types'

// New response format from updated API
interface ProcessingResult {
  success: boolean
  jobId?: string
  filename?: string
  fileSize?: number
  contentPreview?: string
  metadata?: {
    pageCount?: number
    author?: string
    creationDate?: string
    wordCount?: number
    charCount?: number
    contentType?: string
    language?: string
  }
  processingTime?: string
  ingestionId?: string
  result?: IngestionResult
  error?: {
    type: string
    message: string
    suggestions?: string[]
  }
}

export default function IngestionTestPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [result, setResult] = useState<IngestionResult | null>(null)
  const [processingResult, setProcessingResult] = useState<ProcessingResult | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState<IngestionProgress | null>(null)
  const [logs, setLogs] = useState<string[]>([])

  const addLog = (message: string) => {
    setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`])
  }

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      setSelectedFile(file)
      setResult(null)
      setProcessingResult(null)
      setProgress(null)
      setLogs([])
      addLog(`File selected: ${file.name} (${Math.round(file.size / 1024)} KB)`)
    }
  }

  const handleIngest = async () => {
    if (!selectedFile) return

    setIsProcessing(true)
    setResult(null)
    setProcessingResult(null)
    setProgress(null)
    addLog('Starting ingestion process...')

    try {
      // Create form data for API request
      const formData = new FormData()
      formData.append('file', selectedFile)
      formData.append('priority', 'high')
      formData.append('userId', 'test-user')
      formData.append('projectId', 'test-project')
      formData.append('sessionId', 'test-session')

      addLog(`Sending file to API: ${selectedFile.name} (${Math.round(selectedFile.size / 1024)} KB)`)

      const startTime = Date.now()

      // Call the ingestion API
      const response = await fetch('/api/ingest', {
        method: 'POST',
        body: formData,
      })

      const requestTime = Date.now() - startTime
      addLog(`📡 API response received in ${requestTime}ms`)

      const apiResult: ProcessingResult = await response.json()
      setProcessingResult(apiResult)

      if (apiResult.success) {
        setResult(apiResult.result || null)
        addLog(`✅ Processing completed successfully!`)
        addLog(`📊 Content preview: ${apiResult.contentPreview?.substring(0, 100)}...`)
        addLog(`⏱️ Processing time: ${apiResult.processingTime}`)
        if (apiResult.metadata?.wordCount) {
          addLog(`📝 Word count: ${apiResult.metadata.wordCount}`)
        }
        if (apiResult.metadata?.pageCount) {
          addLog(`📄 Page count: ${apiResult.metadata.pageCount}`)
        }
      } else {
        // Create a mock failed result for backward compatibility
        const failedResult: IngestionResult = {
          ingestionId: apiResult.ingestionId || 'unknown',
          content: null,
          warnings: [],
          error: apiResult.error ? {
            type: apiResult.error.type as IngestionErrorType,
            message: apiResult.error.message,
            timestamp: new Date(),
            retryable: true,
            suggestions: apiResult.error.suggestions
          } : { type: 'unknown_error' as IngestionErrorType, message: 'Unknown error', timestamp: new Date(), retryable: false },
          success: false,
          processingTime: requestTime,
          startedAt: new Date(),
          completedAt: new Date()
        }
        setResult(failedResult)
        addLog(`❌ Processing failed: ${apiResult.error?.message || 'Unknown error'}`)
      }

    } catch (error) {
      addLog(`❌ API Error: ${error instanceof Error ? error.message : 'Unknown error'}`)

      // Create error result for both new and old format
      const errorResult: ProcessingResult = {
        success: false,
        error: {
          type: 'network_error',
          message: error instanceof Error ? error.message : 'Network error occurred',
          suggestions: ['Check your internet connection', 'Try again in a moment']
        }
      }
      setProcessingResult(errorResult)

      // Legacy format for backward compatibility
      const legacyErrorResult: IngestionResult = {
        ingestionId: 'error',
        content: null,
        warnings: [],
        error: {
          type: 'network_error',
          message: error instanceof Error ? error.message : 'Network error occurred',
          timestamp: new Date(),
          retryable: true
        },
        success: false,
        processingTime: 0,
        startedAt: new Date(),
        completedAt: new Date()
      }
      setResult(legacyErrorResult)
    } finally {
      setIsProcessing(false)
      setProgress(null)
    }
  }

  const createTestFile = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/plain' })
    const file = new File([blob], filename, { type: 'text/plain' })
    setSelectedFile(file)
    setResult(null)
    setProcessingResult(null)
    setProgress(null)
    setLogs([])
    addLog(`Test file created: ${filename}`)
  }

  // Define supported types and max size locally (should match server-side values)
  const supportedTypes = ['.txt', '.pdf', '.fdx', '.celtx', '.docx', '.pptx', '.ppt']
  const maxSize = 10 * 1024 * 1024 // 10MB

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-purple-950 to-pink-950 p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold text-white mb-8">Ingestion Engine Test</h1>

        {/* File Selection */}
        <div className="grid lg:grid-cols-2 gap-8 mb-8">
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
            <h2 className="text-2xl font-semibold text-white mb-4">File Selection</h2>
            
            <div className="mb-4">
              <label className="block text-white mb-2">Select File:</label>
              <input
                type="file"
                onChange={handleFileSelect}
                accept={supportedTypes.join(',')}
                className="w-full p-3 bg-white/20 border border-white/30 rounded-lg text-white"
              />
            </div>

            <div className="mb-4">
              <p className="text-white/70 text-sm">
                Supported types: {supportedTypes.join(', ')}
              </p>
              <p className="text-white/70 text-sm">
                Maximum size: {Math.round(maxSize / (1024 * 1024))}MB
              </p>
            </div>

            <div className="space-y-2">
              <h3 className="text-white font-medium">Create Test Files:</h3>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => createTestFile(
                    'FADE IN:\n\nEXT. PARK - DAY\n\nA beautiful sunny day in the park. JOHN (30s) sits on a bench reading a book.\n\nJOHN\nWhat a wonderful day for reading.\n\nFADE OUT.',
                    'test-script.fdx'
                  )}
                  className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded text-sm"
                >
                  Script
                </button>
                <button
                  onClick={() => createTestFile(
                    'Project Treatment\n\nTitle: The Amazing Story\nBy: Test Author\n\nThis is a treatment for an amazing story about a young person who discovers they have special powers and must save the world.',
                    'test-treatment.txt'
                  )}
                  className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm"
                >
                  Treatment
                </button>
                <button
                  onClick={() => createTestFile(
                    'Large File Test\n' + 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(1000),
                    'large-file.txt'
                  )}
                  className="px-3 py-1 bg-orange-600 hover:bg-orange-700 text-white rounded text-sm"
                >
                  Large File
                </button>
                <button
                  onClick={() => createTestFile('', 'empty-file.txt')}
                  className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-sm"
                >
                  Empty File
                </button>
              </div>
            </div>

            {selectedFile && (
              <div className="mt-4 p-3 bg-white/10 rounded-lg">
                <h3 className="text-white font-medium mb-2">Selected File:</h3>
                <p className="text-white/80 text-sm">Name: {selectedFile.name}</p>
                <p className="text-white/80 text-sm">Size: {Math.round(selectedFile.size / 1024)} KB</p>
                <p className="text-white/80 text-sm">Type: {selectedFile.type || 'unknown'}</p>
              </div>
            )}

            <button
              onClick={handleIngest}
              disabled={!selectedFile || isProcessing}
              className="w-full mt-4 p-3 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 text-white rounded-lg transition-colors"
            >
              {isProcessing ? 'Processing...' : 'Ingest File'}
            </button>
          </div>

          {/* Progress and Logs */}
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
            <h2 className="text-2xl font-semibold text-white mb-4">Progress & Logs</h2>

            {progress && (
              <div className="mb-4">
                <div className="flex justify-between text-white mb-2">
                  <span>Progress: {progress.progress}%</span>
                  <span>{progress.currentStep}</span>
                </div>
                <div className="w-full bg-white/20 rounded-full h-2">
                  <div 
                    className="bg-purple-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${progress.progress}%` }}
                  />
                </div>
                {progress.details && (
                  <p className="text-white/70 text-sm mt-1">{progress.details}</p>
                )}
              </div>
            )}

            <div className="bg-black/30 rounded-lg p-4 h-64 overflow-y-auto">
              <h3 className="text-white font-medium mb-2">Logs:</h3>
              {logs.length === 0 ? (
                <p className="text-white/50 text-sm">No logs yet...</p>
              ) : (
                <div className="space-y-1">
                  {logs.map((log, index) => (
                    <p key={index} className="text-white/80 text-sm font-mono">{log}</p>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* New Processing Results */}
        {processingResult && (
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20 mb-8">
            <h2 className="text-2xl font-semibold text-white mb-4">
              Processing Results
              <span className={`ml-2 text-sm px-2 py-1 rounded ${
                processingResult.success ? 'bg-green-600' : 'bg-red-600'
              }`}>
                {processingResult.success ? 'SUCCESS' : 'FAILED'}
              </span>
            </h2>

            {processingResult.success ? (
              <div className="space-y-6">
                {/* Summary Cards */}
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="bg-black/20 rounded-lg p-4">
                    <h3 className="text-purple-300 font-semibold">File Info</h3>
                    <p className="text-white/80 text-sm">📁 {processingResult.filename}</p>
                    <p className="text-white/80 text-sm">📏 {Math.round((processingResult.fileSize || 0) / 1024)} KB</p>
                    <p className="text-white/80 text-sm">⏱️ {processingResult.processingTime}</p>
                  </div>

                  <div className="bg-black/20 rounded-lg p-4">
                    <h3 className="text-purple-300 font-semibold">Content Stats</h3>
                    <p className="text-white/80 text-sm">📝 {processingResult.metadata?.wordCount || 0} words</p>
                    <p className="text-white/80 text-sm">📄 {processingResult.metadata?.pageCount || 0} pages</p>
                    <p className="text-white/80 text-sm">🔤 {processingResult.metadata?.charCount || 0} chars</p>
                  </div>

                  <div className="bg-black/20 rounded-lg p-4">
                    <h3 className="text-purple-300 font-semibold">Document Info</h3>
                    <p className="text-white/80 text-sm">📋 {processingResult.metadata?.contentType || 'Unknown'}</p>
                    {processingResult.metadata?.author && (
                      <p className="text-white/80 text-sm">✍️ {processingResult.metadata.author}</p>
                    )}
                    {processingResult.metadata?.language && (
                      <p className="text-white/80 text-sm">🌐 {processingResult.metadata.language}</p>
                    )}
                  </div>
                </div>

                {/* Content Preview */}
                {processingResult.contentPreview && (
                  <div>
                    <h3 className="text-white font-medium mb-2">Content Preview:</h3>
                    <div className="bg-black/20 rounded-lg p-4">
                      <div className="bg-black/30 rounded p-3 max-h-48 overflow-y-auto">
                        <pre className="text-white/80 text-sm whitespace-pre-wrap">
                          {processingResult.contentPreview}
                        </pre>
                      </div>
                    </div>
                  </div>
                )}

                {/* Job ID and Technical Details */}
                <div className="bg-black/20 rounded-lg p-4">
                  <h3 className="text-white font-medium mb-2">Technical Details:</h3>
                  <p className="text-white/70 text-sm">Job ID: <code className="text-purple-300">{processingResult.jobId}</code></p>
                  <p className="text-white/70 text-sm">Ingestion ID: <code className="text-purple-300">{processingResult.ingestionId}</code></p>
                </div>
              </div>
            ) : (
              /* Error Display */
              <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-4">
                <h3 className="text-red-300 font-medium mb-2">Processing Error:</h3>
                <p className="text-white/80 mb-2">{processingResult.error?.message}</p>
                {processingResult.error?.suggestions && processingResult.error.suggestions.length > 0 && (
                  <div>
                    <p className="text-white/70 text-sm font-medium mb-1">Suggestions:</p>
                    <ul className="text-white/60 text-sm list-disc list-inside space-y-1">
                      {processingResult.error.suggestions.map((suggestion, index) => (
                        <li key={index}>{suggestion}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Legacy Results (for backward compatibility) */}
        {result && (
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
            <h2 className="text-2xl font-semibold text-white mb-4">
              Ingestion Result 
              <span className={`ml-2 text-sm px-2 py-1 rounded ${
                result.success ? 'bg-green-600' : 'bg-red-600'
              }`}>
                {result.success ? 'SUCCESS' : 'FAILED'}
              </span>
            </h2>

            <div className="grid md:grid-cols-2 gap-6">
              {/* Basic Info */}
              <div>
                <h3 className="text-white font-medium mb-2">Basic Information:</h3>
                <div className="bg-black/20 rounded-lg p-4 text-sm">
                  <p className="text-white/80">ID: <span className="text-purple-300">{result.ingestionId}</span></p>
                  <p className="text-white/80">Processing Time: <span className="text-purple-300">{result.processingTime}ms</span></p>
                  <p className="text-white/80">Started: <span className="text-purple-300">{result.startedAt.toLocaleString()}</span></p>
                  <p className="text-white/80">Completed: <span className="text-purple-300">{result.completedAt.toLocaleString()}</span></p>
                </div>
              </div>

              {/* Warnings */}
              <div>
                <h3 className="text-white font-medium mb-2">Warnings ({result.warnings.length}):</h3>
                <div className="bg-black/20 rounded-lg p-4 text-sm max-h-32 overflow-y-auto">
                  {result.warnings.length === 0 ? (
                    <p className="text-white/50">No warnings</p>
                  ) : (
                    <div className="space-y-2">
                      {result.warnings.map((warning, index) => (
                        <div key={index} className="border-l-2 border-yellow-500 pl-2">
                          <p className="text-yellow-300 font-medium">{warning.type}</p>
                          <p className="text-white/80">{warning.message}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Error */}
              {result.error && (
                <div className="md:col-span-2">
                  <h3 className="text-white font-medium mb-2">Error:</h3>
                  <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-4">
                    <p className="text-red-300 font-medium">{result.error.type}</p>
                    <p className="text-white/80 mb-2">{result.error.message}</p>
                    {result.error.suggestions && result.error.suggestions.length > 0 && (
                      <div>
                        <p className="text-white/70 text-sm font-medium">Suggestions:</p>
                        <ul className="text-white/60 text-sm list-disc list-inside">
                          {result.error.suggestions.map((suggestion, index) => (
                            <li key={index}>{suggestion}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Content */}
              {result.content && (
                <>
                  <div className="md:col-span-2">
                    <h3 className="text-white font-medium mb-2">Extracted Content:</h3>
                    <div className="bg-black/20 rounded-lg p-4">
                      <div className="grid md:grid-cols-2 gap-4 mb-4 text-sm">
                        <div>
                          <p className="text-white/80">Content Type: <span className="text-purple-300">{result.content.contentType}</span></p>
                          <p className="text-white/80">File Type: <span className="text-purple-300">{result.content.fileType}</span></p>
                          <p className="text-white/80">Status: <span className="text-purple-300">{result.content.status}</span></p>
                        </div>
                        <div>
                          <p className="text-white/80">Word Count: <span className="text-purple-300">{result.content.metadata.wordCount}</span></p>
                          <p className="text-white/80">Char Count: <span className="text-purple-300">{result.content.metadata.charCount}</span></p>
                          <p className="text-white/80">Pages: <span className="text-purple-300">{result.content.metadata.pageCount}</span></p>
                        </div>
                      </div>
                      
                      {result.content.metadata.title && (
                        <p className="text-white/80 mb-2">Title: <span className="text-purple-300">{result.content.metadata.title}</span></p>
                      )}
                      {result.content.metadata.author && (
                        <p className="text-white/80 mb-2">Author: <span className="text-purple-300">{result.content.metadata.author}</span></p>
                      )}
                      
                      <div className="mt-4">
                        <p className="text-white/80 text-sm mb-2">Text Content Preview:</p>
                        <div className="bg-black/30 rounded p-3 max-h-48 overflow-y-auto">
                          <pre className="text-white/70 text-xs whitespace-pre-wrap">
                            {result.content.textContent.substring(0, 1000)}
                            {result.content.textContent.length > 1000 && '...'}
                          </pre>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* Debug Info */}
              {result.debug && (
                <div className="md:col-span-2">
                  <h3 className="text-white font-medium mb-2">Debug Information:</h3>
                  <div className="bg-black/20 rounded-lg p-4 text-sm">
                    <div className="mb-3">
                      <p className="text-white/80 font-medium">Processing Steps:</p>
                      <ul className="text-white/60 list-disc list-inside">
                        {result.debug.steps.map((step, index) => (
                          <li key={index}>{step}</li>
                        ))}
                      </ul>
                    </div>
                    
                    <div>
                      <p className="text-white/80 font-medium">Metrics:</p>
                      <pre className="text-white/60 text-xs">
                        {JSON.stringify(result.debug.metrics, null, 2)}
                      </pre>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}