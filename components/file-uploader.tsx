/**
 * File Uploader Component - Secure File Upload with Progress Tracking
 *
 * Client Component that handles secure file upload using signed URLs with
 * real-time progress feedback and comprehensive error handling.
 *
 * Upload Flow:
 * 1. File Selection & Validation
 * 2. Request Signed Upload URL from API
 * 3. Upload File to Storage with Progress Tracking
 * 4. Finalize Upload & Trigger AI Processing
 * 5. Redirect to Dashboard
 */

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Component props interface
 */
interface FileUploaderProps {
  projectId: string
}

/**
 * Upload status type definition
 */
type UploadStatus = 'idle' | 'requesting-url' | 'uploading' | 'finalizing' | 'success' | 'error'

/**
 * File validation constants
 */
const VALID_FILE_TYPES = ['application/pdf', 'text/plain']
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB in bytes

/**
 * Helper function to format file size
 */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

/**
 * Helper function to validate file type
 */
function isValidFileType(file: File): boolean {
  return VALID_FILE_TYPES.includes(file.type) ||
         file.name.toLowerCase().endsWith('.pdf') ||
         file.name.toLowerCase().endsWith('.txt')
}

/**
 * File Uploader Component
 */
export function FileUploader({ projectId }: FileUploaderProps) {
  const router = useRouter()

  // File selection state
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  // Upload progress state
  const [uploadProgress, setUploadProgress] = useState(0)

  // Upload status state
  const [status, setStatus] = useState<UploadStatus>('idle')

  // Error state
  const [error, setError] = useState<string | null>(null)

  /**
   * Handle file selection with validation
   */
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]

    if (!file) {
      setSelectedFile(null)
      return
    }

    // Reset previous states
    setError(null)
    setUploadProgress(0)
    setStatus('idle')

    // Validate file type
    if (!isValidFileType(file)) {
      setError('Please upload a PDF or TXT file')
      setSelectedFile(null)
      return
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      setError(`File size must be less than ${formatFileSize(MAX_FILE_SIZE)}`)
      setSelectedFile(null)
      return
    }

    // File is valid
    setSelectedFile(file)
  }

  /**
   * Handle drag and drop file selection
   */
  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]

    if (file) {
      // Create a synthetic event for the file input handler
      const syntheticEvent = {
        target: { files: [file] }
      } as unknown as React.ChangeEvent<HTMLInputElement>

      handleFileSelect(syntheticEvent)
    }
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
  }

  /**
   * Main upload handler - orchestrates the upload flow
   */
  const handleUpload = async () => {
    if (!selectedFile) return

    try {
      await requestUploadUrl()
    } catch (err) {
      console.error('Upload failed:', err)
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Upload failed')
    }
  }

  /**
   * Step 1: Request signed upload URL from API
   */
  const requestUploadUrl = async () => {
    setStatus('requesting-url')
    setError(null)

    const response = await fetch('/api/projects/request-upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId,
        fileName: selectedFile!.name,
        fileType: selectedFile!.type
      })
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || 'Failed to get upload URL')
    }

    const { signedUrl, filePath } = await response.json()

    // Proceed to upload
    await uploadFileToStorage(signedUrl, filePath)
  }

  /**
   * Step 2: Upload file to signed URL with progress tracking
   */
  const uploadFileToStorage = (signedUrl: string, filePath: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      setStatus('uploading')
      setUploadProgress(0)

      const xhr = new XMLHttpRequest()

      // Track upload progress
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percentComplete = Math.round((e.loaded / e.total) * 100)
          setUploadProgress(percentComplete)
        }
      })

      // Handle successful upload
      xhr.addEventListener('load', async () => {
        if (xhr.status === 200 || xhr.status === 201) {
          try {
            await finalizeUpload(filePath)
            resolve()
          } catch (err) {
            reject(err)
          }
        } else {
          reject(new Error(`Upload failed with status: ${xhr.status}`))
        }
      })

      // Handle upload errors
      xhr.addEventListener('error', () => {
        reject(new Error('Network error during upload'))
      })

      // Handle upload timeout
      xhr.addEventListener('timeout', () => {
        reject(new Error('Upload timed out'))
      })

      // Configure and send request
      xhr.open('PUT', signedUrl)
      xhr.setRequestHeader('Content-Type', selectedFile!.type)
      xhr.timeout = 300000 // 5 minute timeout
      xhr.send(selectedFile)
    })
  }

  /**
   * Step 3: Finalize upload and trigger AI processing
   */
  const finalizeUpload = async (filePath: string) => {
    setStatus('finalizing')

    const response = await fetch('/api/projects/finalize-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId,
        filePath
      })
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || 'Failed to finalize upload')
    }

    setStatus('success')

    // Redirect to dashboard after showing success message
    setTimeout(() => {
      router.push('/dashboard')
    }, 2000)
  }

  /**
   * Reset upload state for retry
   */
  const resetUpload = () => {
    setStatus('idle')
    setError(null)
    setUploadProgress(0)
  }

  return (
    <div className="space-y-6">
      {/* File Selection Area */}
      {status === 'idle' && (
        <div
          onDrop={handleFileDrop}
          onDragOver={handleDragOver}
          className="border-2 border-dashed border-gray-300 hover:border-blue-500 rounded-lg p-8 text-center transition-colors duration-200"
        >
          <div className="space-y-4">
            {/* Upload Icon */}
            <div className="flex justify-center">
              <svg className="h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>

            {/* Upload Text */}
            <div>
              <p className="text-lg font-medium text-gray-900">
                Drop your script here, or{' '}
                <label className="text-blue-600 hover:text-blue-500 cursor-pointer underline">
                  browse
                  <input
                    type="file"
                    className="sr-only"
                    accept=".pdf,.txt"
                    onChange={handleFileSelect}
                  />
                </label>
              </p>
              <p className="text-sm text-gray-500 mt-1">
                PDF or TXT files, up to {formatFileSize(MAX_FILE_SIZE)}
              </p>
            </div>

            {/* Selected File Display */}
            {selectedFile && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <svg className="h-8 w-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <div>
                      <p className="text-sm font-medium text-blue-900">{selectedFile.name}</p>
                      <p className="text-xs text-blue-700">{formatFileSize(selectedFile.size)}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedFile(null)}
                    className="text-blue-600 hover:text-blue-800"
                  >
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Upload Button */}
      {status === 'idle' && selectedFile && (
        <button
          onClick={handleUpload}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-200 flex items-center justify-center"
        >
          <svg className="mr-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          Upload Script
        </button>
      )}

      {/* Status Messages */}
      {status === 'requesting-url' && (
        <div className="text-center py-8">
          <div className="inline-flex items-center">
            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span className="text-gray-700">Preparing upload...</span>
          </div>
        </div>
      )}

      {/* Upload Progress */}
      {status === 'uploading' && (
        <div className="space-y-4">
          <div className="text-center">
            <p className="text-lg font-medium text-gray-900">
              Uploading script... {uploadProgress}%
            </p>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-4">
            <div
              className="bg-blue-600 h-4 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${uploadProgress}%` }}
            ></div>
          </div>
        </div>
      )}

      {/* Finalizing */}
      {status === 'finalizing' && (
        <div className="text-center py-8">
          <div className="inline-flex items-center">
            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-green-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span className="text-gray-700">Processing... AI analysis starting soon</span>
          </div>
        </div>
      )}

      {/* Success */}
      {status === 'success' && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-6 py-4 rounded-lg text-center">
          <div className="flex items-center justify-center space-x-2">
            <svg className="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="font-medium">Success! Redirecting to dashboard...</span>
          </div>
        </div>
      )}

      {/* Error State */}
      {(status === 'error' || error) && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-lg">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Upload Failed</h3>
              <div className="mt-2 text-sm text-red-700">
                <p>{error || 'An unexpected error occurred during upload'}</p>
              </div>
              <div className="mt-4">
                <button
                  onClick={resetUpload}
                  className="bg-red-100 hover:bg-red-200 text-red-800 font-medium py-2 px-4 rounded text-sm transition-colors duration-200"
                >
                  Try Again
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}