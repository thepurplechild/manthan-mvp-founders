'use client'

import { useState, useEffect } from 'react'
import {
  FileText,
  Download,
  Upload,
  Eye,
  Calendar,
  FileX,
  RotateCcw,
  ExternalLink,
  Copy,
  Check,
  AlertCircle,
  Maximize2,
  Minimize2
} from 'lucide-react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'

import { ProjectReviewData } from '@/app/projects/[id]/review/page'

interface ScriptDisplaySectionProps {
  data: ProjectReviewData
  onRefresh: () => void
  isLoading: boolean
}

interface ScriptContent {
  content: string
  loading: boolean
  error: string | null
}

export function ScriptDisplaySection({
  data,
  onRefresh,
  isLoading
}: ScriptDisplaySectionProps) {
  const [selectedScript, setSelectedScript] = useState(0)
  const [scriptContents, setScriptContents] = useState<Record<string, ScriptContent>>({})
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null)

  const formatFileSize = (bytes: number | null): string => {
    if (!bytes) return 'Unknown size'
    const units = ['B', 'KB', 'MB', 'GB']
    let size = bytes
    let unitIndex = 0

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024
      unitIndex++
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'succeeded':
        return 'bg-green-100 text-green-800 border-green-200'
      case 'failed':
        return 'bg-red-100 text-red-800 border-red-200'
      case 'running':
        return 'bg-blue-100 text-blue-800 border-blue-200'
      case 'queued':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const loadScriptContent = async (scriptId: string, sourceUrl: string) => {
    if (scriptContents[scriptId]) return

    setScriptContents(prev => ({
      ...prev,
      [scriptId]: { content: '', loading: true, error: null }
    }))

    try {
      // In a real implementation, this would fetch the script content
      // For now, we'll simulate loading
      await new Promise(resolve => setTimeout(resolve, 1000))

      const mockContent = `FADE IN:

EXT. MUMBAI STREET - DAY

The bustling streets of Mumbai come alive with the sound of auto-rickshaws, street vendors, and the constant hum of city life.

ARJUN (25), a young software engineer with tired eyes but determined spirit, navigates through the crowd with his laptop bag slung over his shoulder.

ARJUN
(to himself)
Another day, another chance to change everything.

He stops at a tea stall, orders chai, and checks his phone. Multiple missed calls from "INVESTOR - MEHTA".

ARJUN (CONT'D)
(answering the phone)
Mr. Mehta, good morning. Yes, the prototype is ready for demo.

CUT TO:

INT. TECH STARTUP OFFICE - CONTINUOUS

A small, cramped office space with mismatched furniture but walls covered with whiteboards full of ideas, flow charts, and dreams.

ARJUN enters, greeting his co-founder PRIYA (24), who's already deep in code.

PRIYA
(without looking up)
Coffee's cold, wifi's down, and we have three hours to fix the payment gateway before the investor meeting.

ARJUN
(grinning)
Perfect. Just another Tuesday in paradise.

MONTAGE - CODING MARATHON

- Fingers flying over keyboards
- Empty coffee cups accumulating
- Frustrated head-in-hands moments
- Breakthrough "eureka" expressions
- High-fives and relief

FADE TO:

INT. CONFERENCE ROOM - LATER

ARJUN and PRIYA sit across from MR. MEHTA (50s), a well-dressed investor with sharp eyes.

MR. MEHTA
Show me what you've built.

Arjun opens his laptop, fingers crossed. The demo begins...

FADE OUT.

THE END

---

This is a sample script content for demonstration purposes. In a real implementation, this would be the actual uploaded script file content.`

      setScriptContents(prev => ({
        ...prev,
        [scriptId]: { content: mockContent, loading: false, error: null }
      }))
    } catch (error) {
      setScriptContents(prev => ({
        ...prev,
        [scriptId]: {
          content: '',
          loading: false,
          error: 'Failed to load script content'
        }
      }))
    }
  }

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedUrl(id)
      setTimeout(() => setCopiedUrl(null), 2000)
    } catch (error) {
      console.error('Failed to copy to clipboard:', error)
    }
  }

  const downloadScript = (script: any) => {
    // In a real implementation, this would trigger a secure download
    const filename = script.source_file_url.split('/').pop() || 'script.txt'
    const link = document.createElement('a')
    link.href = script.source_file_url
    link.download = filename
    link.click()
  }

  if (data.ingestions.length === 0) {
    return (
      <Card>
        <CardContent className="pt-12 pb-12">
          <div className="text-center space-y-4">
            <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
              <FileX className="h-8 w-8 text-gray-400" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-semibold text-gray-900">No Scripts Uploaded</h3>
              <p className="text-gray-600 max-w-md mx-auto">
                This project doesn't have any scripts uploaded yet. Upload a script to begin the AI processing pipeline.
              </p>
            </div>
            <Button onClick={() => window.location.href = `/projects/${data.project.id}/upload`}>
              <Upload className="h-4 w-4 mr-2" />
              Upload Script
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  const currentScript = data.ingestions[selectedScript]
  const scriptContent = currentScript ? scriptContents[currentScript.id] : null

  return (
    <div className="space-y-6">
      {/* Scripts List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Uploaded Scripts ({data.ingestions.length})
          </CardTitle>
          <CardDescription>
            View and manage uploaded script files for this project
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={selectedScript.toString()} onValueChange={(value) => setSelectedScript(parseInt(value))}>
            <TabsList className="grid w-full grid-cols-auto">
              {data.ingestions.map((script, index) => (
                <TabsTrigger key={script.id} value={index.toString()} className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Script {index + 1}
                </TabsTrigger>
              ))}
            </TabsList>

            {data.ingestions.map((script, index) => (
              <TabsContent key={script.id} value={index.toString()} className="mt-6">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Script Information */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">File Information</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Filename */}
                      <div>
                        <label className="text-sm font-medium text-gray-700">Filename</label>
                        <p className="text-sm text-gray-900 font-mono bg-gray-50 p-2 rounded border">
                          {script.source_file_url.split('/').pop() || 'script.txt'}
                        </p>
                      </div>

                      {/* Upload Date */}
                      <div>
                        <label className="text-sm font-medium text-gray-700 flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          Upload Date
                        </label>
                        <p className="text-sm text-gray-600">
                          {new Date(script.created_at).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </p>
                      </div>

                      {/* File Type */}
                      {script.mime_type && (
                        <div>
                          <label className="text-sm font-medium text-gray-700">File Type</label>
                          <Badge variant="secondary" className="mt-1">
                            {script.mime_type}
                          </Badge>
                        </div>
                      )}

                      {/* Processing Status */}
                      <div>
                        <label className="text-sm font-medium text-gray-700">Processing Status</label>
                        <div className="mt-1">
                          <Badge className={getStatusColor(script.status)}>
                            {script.status}
                          </Badge>
                          <p className="text-xs text-gray-500 mt-1">
                            Progress: {script.progress}%
                          </p>
                        </div>
                      </div>

                      {/* Error Message */}
                      {script.error && (
                        <div>
                          <label className="text-sm font-medium text-red-700 flex items-center gap-1">
                            <AlertCircle className="h-4 w-4" />
                            Error
                          </label>
                          <p className="text-sm text-red-600 bg-red-50 p-2 rounded border border-red-200 mt-1">
                            {script.error}
                          </p>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="pt-4 border-t space-y-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          onClick={() => loadScriptContent(script.id, script.source_file_url)}
                          disabled={scriptContent?.loading}
                        >
                          {scriptContent?.loading ? (
                            <>
                              <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin mr-2" />
                              Loading...
                            </>
                          ) : (
                            <>
                              <Eye className="h-4 w-4 mr-2" />
                              View Content
                            </>
                          )}
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          onClick={() => downloadScript(script)}
                        >
                          <Download className="h-4 w-4 mr-2" />
                          Download
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          onClick={() => copyToClipboard(script.source_file_url, script.id)}
                        >
                          {copiedUrl === script.id ? (
                            <>
                              <Check className="h-4 w-4 mr-2 text-green-600" />
                              Copied!
                            </>
                          ) : (
                            <>
                              <Copy className="h-4 w-4 mr-2" />
                              Copy URL
                            </>
                          )}
                        </Button>

                        {script.status === 'failed' && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full text-orange-600 border-orange-300 hover:bg-orange-50"
                            onClick={() => {
                              // Trigger reprocessing
                              window.location.href = `/projects/${data.project.id}/upload`
                            }}
                          >
                            <RotateCcw className="h-4 w-4 mr-2" />
                            Retry Processing
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Script Content Viewer */}
                  <Card className="lg:col-span-2">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0">
                      <div>
                        <CardTitle className="text-lg">Script Content</CardTitle>
                        <CardDescription>
                          Preview of the uploaded script file
                        </CardDescription>
                      </div>
                      {scriptContent && !scriptContent.loading && !scriptContent.error && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setIsFullscreen(!isFullscreen)}
                        >
                          {isFullscreen ? (
                            <Minimize2 className="h-4 w-4" />
                          ) : (
                            <Maximize2 className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                    </CardHeader>
                    <CardContent>
                      {!scriptContent ? (
                        <div className="text-center py-12 border-2 border-dashed border-gray-300 rounded-lg">
                          <FileText className="h-8 w-8 text-gray-400 mx-auto mb-3" />
                          <p className="text-gray-500 mb-4">Click "View Content" to load the script</p>
                        </div>
                      ) : scriptContent.loading ? (
                        <div className="text-center py-12">
                          <div className="w-8 h-8 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin mx-auto mb-3" />
                          <p className="text-gray-500">Loading script content...</p>
                        </div>
                      ) : scriptContent.error ? (
                        <div className="text-center py-12 border-2 border-dashed border-red-300 rounded-lg bg-red-50">
                          <AlertCircle className="h-8 w-8 text-red-400 mx-auto mb-3" />
                          <p className="text-red-600 mb-4">{scriptContent.error}</p>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => loadScriptContent(script.id, script.source_file_url)}
                          >
                            <RotateCcw className="h-4 w-4 mr-2" />
                            Retry
                          </Button>
                        </div>
                      ) : (
                        <div className={`relative ${isFullscreen ? 'fixed inset-0 z-50 bg-white' : ''}`}>
                          {isFullscreen && (
                            <div className="flex justify-between items-center p-4 border-b">
                              <h3 className="text-lg font-semibold">
                                {script.source_file_url.split('/').pop()}
                              </h3>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setIsFullscreen(false)}
                              >
                                <Minimize2 className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                          <div className={`${isFullscreen ? 'p-4 h-full overflow-auto' : ''}`}>
                            <pre className="text-sm bg-gray-50 p-4 rounded-lg border font-mono whitespace-pre-wrap leading-relaxed max-h-96 overflow-auto">
                              {scriptContent.content}
                            </pre>
                            {isFullscreen && (
                              <div className="sticky bottom-0 bg-white border-t p-4 mt-4">
                                <div className="flex justify-center gap-4">
                                  <Button
                                    variant="outline"
                                    onClick={() => downloadScript(script)}
                                  >
                                    <Download className="h-4 w-4 mr-2" />
                                    Download
                                  </Button>
                                  <Button
                                    variant="outline"
                                    onClick={() => copyToClipboard(scriptContent.content, `content-${script.id}`)}
                                  >
                                    {copiedUrl === `content-${script.id}` ? (
                                      <>
                                        <Check className="h-4 w-4 mr-2 text-green-600" />
                                        Copied!
                                      </>
                                    ) : (
                                      <>
                                        <Copy className="h-4 w-4 mr-2" />
                                        Copy Content
                                      </>
                                    )}
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      {/* Upload New Script Card */}
      <Card className="border-dashed border-2 border-blue-300 bg-blue-50">
        <CardContent className="pt-6">
          <div className="text-center space-y-4">
            <Upload className="h-8 w-8 text-blue-600 mx-auto" />
            <div>
              <h3 className="text-lg font-semibold text-blue-900">Upload Additional Script</h3>
              <p className="text-blue-700">
                Upload a new version or additional script file for this project
              </p>
            </div>
            <Button
              className="bg-blue-600 hover:bg-blue-700"
              onClick={() => window.location.href = `/projects/${data.project.id}/upload`}
            >
              <Upload className="h-4 w-4 mr-2" />
              Upload New Script
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}