'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle,
  Clock,
  Download,
  Eye,
  FileIcon,
  FileText,
  HardDrive,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  Tag,
  Trash2,
  Upload,
  XCircle,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'

const statusLabels: Record<FileStatus, string> = {
  queued: 'Queued',
  processing: 'Processing',
  uploaded: 'Uploaded',
  completed: 'Completed',
  failed: 'Failed',
  missing: 'Missing',
}

const statusVariants: Record<FileStatus, string> = {
  queued: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  processing: 'bg-blue-100 text-blue-800 border-blue-200',
  uploaded: 'bg-gray-100 text-gray-700 border-gray-200',
  completed: 'bg-green-100 text-green-800 border-green-200',
  failed: 'bg-red-100 text-red-700 border-red-200',
  missing: 'bg-red-100 text-red-700 border-red-200',
}

const categoryIcons: Record<FileCategory, JSX.Element> = {
  script: <FileText className="w-4 h-4" />,
  document: <FileIcon className="w-4 h-4" />,
  image: <ImageIcon className="w-4 h-4" />,
  other: <Tag className="w-4 h-4" />,
}

const statusIcons: Record<FileStatus, JSX.Element> = {
  queued: <Clock className="w-4 h-4" />,
  processing: <RefreshCw className="w-4 h-4 animate-spin" />,
  uploaded: <Upload className="w-4 h-4" />,
  completed: <CheckCircle className="w-4 h-4" />,
  failed: <XCircle className="w-4 h-4" />,
  missing: <AlertCircle className="w-4 h-4" />,
}

type FileStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'uploaded' | 'missing'
type FileCategory = 'script' | 'document' | 'image' | 'other'

type ProjectFile = {
  id: string
  type: 'script_upload' | 'ingestion_only' | 'both'
  project_id: string
  script_upload_id: string | null
  ingestion_id: string | null
  storage_bucket: string
  storage_path: string
  storage_exists: boolean | null
  storage_checked_at: string | null
  file_name: string
  file_extension: string | null
  file_size: number | null
  mime_type: string | null
  category: FileCategory
  version: number
  checksum: string | null
  uploaded_at: string
  updated_at: string | null
  status: FileStatus
  status_source: 'script_upload' | 'ingestion' | 'storage'
  ingestion_status: string | null
  ingestion_progress: number | null
  ingestion_error: string | null
  antivirus_status: string
  antivirus_scanned_at: string | null
  validation_status: string
  validation_notes: string | null
  preview_available: boolean
  download_available: boolean
  steps: Array<{
    id: string
    name: string
    status: string
    started_at: string | null
    finished_at: string | null
    error: string | null
    attempt?: number | null
    processing_duration_ms?: number | null
  }>
  metrics: {
    estimated_completion_at: string | null
    last_activity_at: string | null
  }
}

type FileStats = {
  total_files: number
  total_size: number
  latest_upload_at: string | null
  latest_activity_at: string | null
  by_status: Record<FileStatus, number>
  by_category: Record<FileCategory, number>
}

type ProjectSummary = {
  id: string
  title: string
  owner_id: string
}

type PreviewState = {
  open: boolean
  file: ProjectFile | null
  loading: boolean
  error: string | null
  downloadUrl: string | null
  textContent: string | null
}

const formatBytes = (value: number | null) => {
  if (!value) return '—'
  if (value < 1024) return `${value} B`
  const units = ['KB', 'MB', 'GB']
  let size = value / 1024
  let unitIndex = 0
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }
  return `${size.toFixed(1)} ${units[unitIndex]}`
}

const formatDateTime = (value: string | null) => {
  if (!value) return '—'
  return new Date(value).toLocaleString()
}

const getStatusProgress = (file: ProjectFile) => {
  if (file.status === 'completed') return 100
  if (file.status === 'failed') return file.ingestion_progress ?? 0
  if (file.status === 'processing' || file.status === 'queued') {
    return file.ingestion_progress ?? 0
  }
  return 0
}

const getStatusDescription = (file: ProjectFile) => {
  if (file.status === 'missing') {
    return 'File missing in storage - please re-upload.'
  }
  if (file.ingestion_error) {
    return file.ingestion_error
  }
  if (file.status === 'processing' && file.metrics.estimated_completion_at) {
    return `Estimated completion ~ ${new Date(file.metrics.estimated_completion_at).toLocaleTimeString()}`
  }
  if (file.status === 'queued') {
    return 'Awaiting processing'
  }
  return null
}

const PreviewDialog = ({ state, onClose }: { state: PreviewState; onClose: () => void }) => {
  const isPdf = state.file?.mime_type === 'application/pdf' || state.file?.file_extension === 'pdf'
  const isText = state.file?.preview_available && !isPdf

  return (
    <Dialog open={state.open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{state.file?.file_name ?? 'Preview'}</DialogTitle>
          <DialogDescription>
            {state.file?.mime_type || 'Unknown type'} • {formatBytes(state.file?.file_size ?? null)}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-[24rem] border rounded-lg overflow-hidden bg-white">
          {state.loading && (
            <div className="flex flex-col items-center justify-center h-96 gap-3 text-sm text-manthan-charcoal-600">
              <Loader2 className="w-6 h-6 animate-spin" />
              <span>Preparing preview…</span>
            </div>
          )}
          {!state.loading && state.error && (
            <div className="flex flex-col items-center justify-center h-96 gap-2 text-sm text-red-600">
              <AlertCircle className="w-6 h-6" />
              <span>{state.error}</span>
            </div>
          )}
          {!state.loading && !state.error && state.downloadUrl && (
            <div className="h-[32rem]">
              {isPdf ? (
                <iframe src={state.downloadUrl} className="w-full h-full" title="PDF preview" />
              ) : isText && state.textContent ? (
                <pre className="w-full h-full overflow-auto bg-manthan-charcoal-900 text-manthan-mint-200 text-sm p-4 whitespace-pre-wrap">
                  {state.textContent}
                </pre>
              ) : (
                <iframe src={state.downloadUrl} className="w-full h-full" title="File preview" />
              )}
            </div>
          )}
        </div>
        <DialogFooter className="flex items-center justify-between gap-3">
          <div className="text-xs text-manthan-charcoal-500">
            Antivirus: {state.file?.antivirus_status ?? 'unknown'}
            {state.file?.antivirus_scanned_at && (
              <> • Last scanned {formatDateTime(state.file?.antivirus_scanned_at)}</>
            )}
          </div>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function ProjectFilesPage() {
  const params = useParams()
  const projectId = params?.id as string

  const [project, setProject] = useState<ProjectSummary | null>(null)
  const [files, setFiles] = useState<ProjectFile[]>([])
  const [stats, setStats] = useState<FileStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [previewState, setPreviewState] = useState<PreviewState>({
    open: false,
    file: null,
    loading: false,
    error: null,
    downloadUrl: null,
    textContent: null,
  })
  const [expandedRows, setExpandedRows] = useState<string[]>([])
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null)

  const supabase = useMemo(() => createClient(), [])

  const getAccessToken = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    return session?.access_token
  }, [supabase])

  const loadFiles = useCallback(async () => {
    if (!projectId) return
    try {
      setLoading(true)
      setError(null)
      const token = await getAccessToken()
      const response = await fetch(`/api/projects/${projectId}/files`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Failed to load files' }))
        throw new Error(err.error || 'Failed to load files')
      }

      const data = await response.json()
      setProject(data.project)
      setFiles(data.files)
      setStats(data.stats)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load files')
    } finally {
      setLoading(false)
    }
  }, [projectId, getAccessToken])

  useEffect(() => {
    if (!projectId) return
    loadFiles()
  }, [projectId, loadFiles])

  const toggleExpanded = (fileId: string) => {
    setExpandedRows((prev) =>
      prev.includes(fileId) ? prev.filter((id) => id !== fileId) : [...prev, fileId]
    )
  }

  const handleDeleteFile = async (file: ProjectFile) => {
    if (!confirm(`Delete "${file.file_name}"? This action cannot be undone.`)) {
      return
    }
    try {
      setDeletingFileId(file.id)
      const token = await getAccessToken()
      const response = await fetch(`/api/projects/${projectId}/files/${file.id}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Failed to delete file' }))
        throw new Error(err.error || 'Failed to delete file')
      }

      await loadFiles()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete file')
    } finally {
      setDeletingFileId(null)
    }
  }

  const handleDownloadFile = async (file: ProjectFile, inline = false) => {
    if (!file.download_available) {
      alert('File is not available in storage. Please re-upload.')
      return
    }
    try {
      const token = await getAccessToken()
      const response = await fetch(`/api/files/${file.id}/download${inline ? '?inline=true' : ''}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        redirect: inline ? 'follow' : 'manual',
      })

      if (inline) {
        if (response.redirected) {
          window.open(response.url, '_blank')
          return
        }
        const redirectUrl = response.headers.get('Location')
        if (redirectUrl) {
          window.open(redirectUrl, '_blank')
        }
        return
      }

      if (response.status >= 300 && response.status < 400) {
        const redirectUrl = response.headers.get('Location')
        if (redirectUrl) {
          window.open(redirectUrl, '_blank')
          return
        }
      }

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Download failed' }))
        throw new Error(err.error || 'Failed to download file')
      }

      const data = await response.json()
      if (data.download_url) {
        window.open(data.download_url, '_blank')
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to download file')
    }
  }

  const openPreview = async (file: ProjectFile) => {
    if (!file.preview_available) {
      alert('Preview is not available for this file type. You can download it instead.')
      return
    }
    setPreviewState({
      open: true,
      file,
      loading: true,
      error: null,
      downloadUrl: null,
      textContent: null,
    })

    try {
      const token = await getAccessToken()
      const response = await fetch(`/api/files/${file.id}/download`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Failed to fetch preview' }))
        throw new Error(err.error || 'Failed to fetch preview')
      }

      const data = await response.json()
      const downloadUrl = data.download_url as string | null

      if (!downloadUrl) {
        throw new Error('Missing download URL')
      }

      let textContent: string | null = null
      const isText = file.mime_type?.startsWith('text/') || ['txt', 'md', 'json'].includes(file.file_extension || '')

      if (isText) {
        const textResponse = await fetch(downloadUrl)
        const blob = await textResponse.blob()
        const reader = new FileReader()
        const textPromise = new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string)
          reader.onerror = () => reject(new Error('Failed to read file preview'))
        })
        reader.readAsText(blob)
        textContent = await textPromise
        if (textContent.length > 200_000) {
          textContent = `${textContent.slice(0, 200_000)}\n\n… (truncated preview)`
        }
      }

      setPreviewState({
        open: true,
        file,
        loading: false,
        error: null,
        downloadUrl,
        textContent,
      })
    } catch (err) {
      setPreviewState({
        open: true,
        file,
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to load preview',
        downloadUrl: null,
        textContent: null,
      })
    }
  }

  const closePreview = () => {
    setPreviewState({
      open: false,
      file: null,
      loading: false,
      error: null,
      downloadUrl: null,
      textContent: null,
    })
  }

  if (loading) {
    return (
      <div className="min-h-screen gradient-indian-bg">
        <div className="container mx-auto px-6 py-12">
          <div className="flex flex-col items-center justify-center gap-4 text-manthan-charcoal-600">
            <Loader2 className="w-8 h-8 animate-spin" />
            <span>Loading files…</span>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen gradient-indian-bg">
        <div className="container mx-auto px-6 py-12">
          <Card className="card-indian max-w-lg mx-auto">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-manthan-coral-600">
                <XCircle className="w-5 h-5" />
                Unable to load files
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-manthan-charcoal-700">{error}</p>
              <div className="flex gap-3">
                <Button variant="outline" onClick={loadFiles}>
                  Retry
                </Button>
                <Link href={`/projects/${projectId}`}>
                  <Button variant="ghost">Back to project</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen gradient-indian-bg">
      <div className="container mx-auto px-6 py-12">
        <div className="max-w-6xl mx-auto space-y-8">
          <div className="flex items-center gap-4">
            <Link href={`/projects/${projectId}`} className="btn-outline-indian inline-flex items-center gap-2 px-4 py-2">
              <ArrowLeft className="w-4 h-4" />
              Back to project
            </Link>
            <div className="flex-1">
              <h1 className="text-3xl font-heading font-bold text-manthan-charcoal-800">Files — {project?.title}</h1>
              <p className="text-manthan-charcoal-600 text-sm">Manage uploaded files, review processing progress, and keep Supabase storage in sync.</p>
            </div>
            <Link href={`/projects/${projectId}/upload`} className="btn-indian inline-flex items-center gap-2">
              <Upload className="w-4 h-4" />
              Upload file
            </Link>
          </div>

          {stats && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card className="card-indian">
                <CardContent className="p-4 flex items-center gap-3">
                  <FileIcon className="w-8 h-8 text-manthan-saffron-600" />
                  <div>
                    <div className="text-2xl font-bold text-manthan-charcoal-800">{stats.total_files}</div>
                    <div className="text-sm text-manthan-charcoal-600">Total files</div>
                  </div>
                </CardContent>
              </Card>
              <Card className="card-indian">
                <CardContent className="p-4 flex items-center gap-3">
                  <CheckCircle className="w-8 h-8 text-manthan-mint-600" />
                  <div>
                    <div className="text-2xl font-bold text-manthan-charcoal-800">{stats.by_status.completed}</div>
                    <div className="text-sm text-manthan-charcoal-600">Completed</div>
                  </div>
                </CardContent>
              </Card>
              <Card className="card-indian">
                <CardContent className="p-4 flex items-center gap-3">
                  <RefreshCw className="w-8 h-8 text-manthan-royal-600" />
                  <div>
                    <div className="text-2xl font-bold text-manthan-charcoal-800">{stats.by_status.processing + stats.by_status.queued}</div>
                    <div className="text-sm text-manthan-charcoal-600">Active jobs</div>
                  </div>
                </CardContent>
              </Card>
              <Card className="card-indian">
                <CardContent className="p-4 flex items-center gap-3">
                  <HardDrive className="w-8 h-8 text-manthan-gold-600" />
                  <div>
                    <div className="text-2xl font-bold text-manthan-charcoal-800">{formatBytes(stats.total_size)}</div>
                    <div className="text-sm text-manthan-charcoal-600">Total size</div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {files.length === 0 ? (
            <Card className="card-indian">
              <CardContent className="p-12 text-center space-y-4">
                <FileText className="w-16 h-16 text-manthan-charcoal-400 mx-auto" />
                <div>
                  <h2 className="text-xl font-semibold text-manthan-charcoal-800">No files uploaded yet</h2>
                  <p className="text-manthan-charcoal-600">Upload your first script to kick off the AI processing pipeline.</p>
                </div>
                <Link href={`/projects/${projectId}/upload`}>
                  <Button className="btn-indian inline-flex items-center gap-2">
                    <Upload className="w-4 h-4" />
                    Upload file
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <Card className="card-indian">
              <CardHeader>
                <CardTitle className="text-lg font-semibold text-manthan-charcoal-800">Project files</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-1/3">File</TableHead>
                        <TableHead className="min-w-[8rem]">Status</TableHead>
                        <TableHead className="min-w-[6rem]">Version</TableHead>
                        <TableHead className="min-w-[8rem]">Size</TableHead>
                        <TableHead className="min-w-[10rem]">Uploaded</TableHead>
                        <TableHead className="min-w-[12rem] text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {files.map((file) => {
                        const progress = getStatusProgress(file)
                        const statusDescription = getStatusDescription(file)
                        const isExpanded = expandedRows.includes(file.id)
                        return (
                          <>
                            <TableRow key={file.id} className="align-top">
                              <TableCell className="space-y-1">
                                <div className="flex items-center gap-3">
                                  <div className="w-9 h-9 rounded-lg bg-manthan-charcoal-900 text-white flex items-center justify-center">
                                    {categoryIcons[file.category]}
                                  </div>
                                  <div>
                                    <div className="font-medium text-manthan-charcoal-900 flex items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={() => toggleExpanded(file.id)}
                                        className="text-left hover:text-manthan-saffron-600"
                                      >
                                        {file.file_name}
                                      </button>
                                      {file.category !== 'other' && (
                                        <Badge variant="outline" className="text-xs capitalize">
                                          {file.category}
                                        </Badge>
                                      )}
                                    </div>
                                    <div className="text-xs text-manthan-charcoal-500 space-x-2">
                                      <span>{file.mime_type || 'Unknown type'}</span>
                                      <span>•</span>
                                      <span>{file.type.replace('_', ' ')}</span>
                                      {!file.storage_exists && <span className="text-manthan-coral-600">• Missing in storage</span>}
                                    </div>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="align-middle">
                                <Badge className={`inline-flex items-center gap-1 ${statusVariants[file.status]}`}>
                                  {statusIcons[file.status]}
                                  {statusLabels[file.status]}
                                </Badge>
                                {statusDescription && (
                                  <div className="text-xs text-manthan-charcoal-500 mt-1 max-w-[12rem]">{statusDescription}</div>
                                )}
                                {(file.status === 'processing' || file.status === 'queued') && (
                                  <div className="mt-2">
                                    <Progress value={progress} className="h-1.5" />
                                    <div className="text-[11px] text-manthan-charcoal-500 mt-1">
                                      {progress}% complete
                                    </div>
                                  </div>
                                )}
                              </TableCell>
                              <TableCell className="align-middle text-sm text-manthan-charcoal-700">
                                v{file.version}
                              </TableCell>
                              <TableCell className="align-middle text-sm text-manthan-charcoal-700">
                                {formatBytes(file.file_size)}
                              </TableCell>
                              <TableCell className="align-middle text-sm text-manthan-charcoal-700">
                                <div>{formatDateTime(file.uploaded_at)}</div>
                                {file.metrics.last_activity_at && (
                                  <div className="text-xs text-manthan-charcoal-500">
                                    Updated {formatDateTime(file.metrics.last_activity_at)}
                                  </div>
                                )}
                              </TableCell>
                              <TableCell className="align-middle">
                                <div className="flex items-center justify-end gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => openPreview(file)}
                                    disabled={!file.preview_available}
                                    className="flex items-center gap-1"
                                  >
                                    <Eye className="w-4 h-4" />
                                    Preview
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleDownloadFile(file)}
                                    disabled={!file.download_available}
                                    className="flex items-center gap-1"
                                  >
                                    <Download className="w-4 h-4" />
                                    Download
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleDeleteFile(file)}
                                    disabled={deletingFileId === file.id}
                                    className="flex items-center gap-1 text-manthan-coral-600 hover:text-manthan-coral-700"
                                  >
                                    {deletingFileId === file.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                    Delete
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                            {isExpanded && (
                              <TableRow className="bg-manthan-charcoal-50/40">
                                <TableCell colSpan={6}>
                                  <div className="p-4 space-y-3 text-sm text-manthan-charcoal-700">
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                      <div>
                                        <h4 className="text-xs uppercase text-manthan-charcoal-500 tracking-wide">Metadata</h4>
                                        <ul className="mt-1 space-y-1 text-xs">
                                          <li>Checksum: {file.checksum ?? '—'}</li>
                                          <li>Storage checked: {formatDateTime(file.storage_checked_at)}</li>
                                          <li>Antivirus: {file.antivirus_status}</li>
                                          <li>Validation: {file.validation_status}</li>
                                        </ul>
                                      </div>
                                      <div>
                                        <h4 className="text-xs uppercase text-manthan-charcoal-500 tracking-wide">Processing</h4>
                                        <ul className="mt-1 space-y-1 text-xs">
                                          <li>Status source: {file.status_source}</li>
                                          <li>Ingestion status: {file.ingestion_status ?? '—'}</li>
                                          <li>Progress: {file.ingestion_progress ?? 0}%</li>
                                          <li>Steps: {file.steps.length}</li>
                                        </ul>
                                      </div>
                                      <div>
                                        <h4 className="text-xs uppercase text-manthan-charcoal-500 tracking-wide">Storage</h4>
                                        <ul className="mt-1 space-y-1 text-xs">
                                          <li>Bucket: {file.storage_bucket}</li>
                                          <li>Path: <code className="text-[10px] break-all">{file.storage_path}</code></li>
                                          <li>Available: {file.storage_exists ? 'Yes' : 'No'}</li>
                                        </ul>
                                      </div>
                                    </div>

                                    {file.ingestion_error && (
                                      <div className="p-3 border border-manthan-coral-200 bg-manthan-coral-50 text-manthan-coral-700 rounded-lg text-xs">
                                        Error: {file.ingestion_error}
                                      </div>
                                    )}

                                    {file.steps.length > 0 && (
                                      <div>
                                        <h4 className="text-xs uppercase text-manthan-charcoal-500 tracking-wide mb-2">Processing steps</h4>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
                                          {file.steps.map((step) => (
                                            <div key={step.id} className="border border-manthan-charcoal-200 rounded-md p-2 bg-white">
                                              <div className="font-medium text-manthan-charcoal-800 capitalize">{step.name.replace(/_/g, ' ')}</div>
                                              <div className="flex items-center gap-1 text-[11px] text-manthan-charcoal-500">
                                                Status: {step.status}
                                              </div>
                                              {step.error && (
                                                <div className="text-[11px] text-manthan-coral-600 mt-1">
                                                  Error: {step.error}
                                                </div>
                                              )}
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex justify-center">
            <Button variant="outline" className="inline-flex items-center gap-2" onClick={loadFiles}>
              <RefreshCw className="w-4 h-4" />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      <PreviewDialog state={previewState} onClose={closePreview} />
    </div>
  )
}
