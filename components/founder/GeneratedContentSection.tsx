'use client'

import { useMemo, useState } from 'react'
import {
  Copy,
  FileText,
  RefreshCw,
  Sparkles,
  Code,
  StickyNote,
} from 'lucide-react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

import type { ProjectReviewData, ReviewGeneratedContent } from '@/types/review'

interface GeneratedContentSectionProps {
  data: ProjectReviewData
  onRefresh: () => void
  isLoading: boolean
}

const stepMetadata: Record<string, { label: string; description: string; icon: React.ComponentType<{ className?: string }> }> = {
  core_extraction: {
    label: 'Core Summary',
    description: 'High-level synopsis, themes, and tonal notes extracted by the AI.',
    icon: StickyNote,
  },
  narrative_insights: {
    label: 'Narrative Insights',
    description: 'Detailed story beats, character arcs, and pacing recommendations.',
    icon: FileText,
  },
  market_adaptation: {
    label: 'Market Adaptation',
    description: 'Localized or platform-specific recommendations for the pitch.',
    icon: Sparkles,
  },
  script_preprocess: {
    label: 'Script Breakdown',
    description: 'Pre-processed script content ready for downstream steps.',
    icon: FileText,
  },
  visuals: {
    label: 'Visual Brief',
    description: 'Mood boards, visual cues, and tonal direction for imagery.',
    icon: Sparkles,
  },
  code_generation: {
    label: 'Code & Technical',
    description: 'Generated code snippets or data transformations.',
    icon: Code,
  },
}

export function GeneratedContentSection({ data, onRefresh, isLoading }: GeneratedContentSectionProps) {
  const grouped = useMemo(() => {
    const map = new Map<string, ReviewGeneratedContent[]>()
    data.generated_content.forEach((item) => {
      const key = item.step || 'general'
      if (!map.has(key)) {
        map.set(key, [])
      }
      map.get(key)!.push(item)
    })
    return map
  }, [data.generated_content])

  const [copiedId, setCopiedId] = useState<string | null>(null)

  const handleCopy = async (content: ReviewGeneratedContent) => {
    try {
      const payload = content.payload ? JSON.stringify(content.payload, null, 2) : ''
      await navigator.clipboard.writeText(payload)
      setCopiedId(content.id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch (error) {
      console.error('[GeneratedContentSection] failed to copy', error)
    }
  }

  if (data.generated_content.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
            <Sparkles className="h-8 w-8 text-gray-400" />
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-gray-900">No generated narratives yet</h3>
            <p className="text-sm text-gray-600 max-w-md mx-auto">
              AI-generated summaries, insights, and briefs will appear here after processing completes.
            </p>
          </div>
          <Button variant="outline" onClick={onRefresh} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Check for updates
          </Button>
        </CardContent>
      </Card>
    )
  }

  const defaultTab = grouped.keys().next().value as string

  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle className="text-xl">Generated Content & Insights</CardTitle>
          <CardDescription>
            AI-authored summaries, market notes, and supporting copy for your review workflow.
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={onRefresh} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue={defaultTab} className="space-y-6">
          <TabsList className="flex w-full flex-wrap gap-2">
            {Array.from(grouped.keys()).map((key) => {
              const meta = stepMetadata[key] || {
                label: key.replace(/_/g, ' '),
                description: 'Generated insights and structured content.',
                icon: FileText,
              }
              const Icon = meta.icon
              return (
                <TabsTrigger
                  key={key}
                  value={key}
                  className="flex items-center gap-2 rounded-full border px-4 py-2 text-sm"
                >
                  <Icon className="h-4 w-4" />
                  {meta.label}
                  <Badge variant="secondary" className="ml-1">
                    {grouped.get(key)?.length}
                  </Badge>
                </TabsTrigger>
              )
            })}
          </TabsList>

          {Array.from(grouped.entries()).map(([key, items]) => {
            const meta = stepMetadata[key] || {
              label: key.replace(/_/g, ' '),
              description: 'Generated insights and structured content.',
              icon: FileText,
            }
            const Icon = meta.icon

            return (
              <TabsContent key={key} value={key} className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-manthan-saffron-100 p-2 text-manthan-saffron-600">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-manthan-charcoal-900">{meta.label}</h3>
                    <p className="text-sm text-gray-600">{meta.description}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {items.map((content) => (
                    <Card key={content.id} className="border border-gray-200 hover:shadow-md transition-shadow">
                      <CardContent className="space-y-4 pt-4">
                        <div className="flex items-center justify-between">
                          <div className="text-xs text-gray-500">
                            Generated {new Date(content.created_at).toLocaleString()}
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCopy(content)}
                            className={copiedId === content.id ? 'border-green-300 bg-green-50 text-green-600' : ''}
                          >
                            <Copy className="h-4 w-4 mr-2" />
                            {copiedId === content.id ? 'Copied!' : 'Copy JSON'}
                          </Button>
                        </div>

                        <GeneratedContentPreview content={content} />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </TabsContent>
            )
          })}
        </Tabs>
      </CardContent>
    </Card>
  )
}

function GeneratedContentPreview({ content }: { content: ReviewGeneratedContent }) {
  if (!content.payload) {
    return (
      <div className="rounded-lg border border-dashed border-gray-200 p-4 text-sm text-gray-500">
        Payload unavailable for this item.
      </div>
    )
  }

  const keys = Object.keys(content.payload)

  if (keys.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-200 p-4 text-sm text-gray-500">
        Payload unavailable for this item.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {keys.map((key) => {
        const value = content.payload![key]
        if (typeof value === 'string') {
          const isCode = key.toLowerCase().includes('code') || value.trim().startsWith('function') || value.includes('const ')
          return (
            <div key={key} className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-gray-500">
                {isCode ? <Code className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
                {key.replace(/_/g, ' ')}
              </div>
              <pre
                className={isCode
                  ? 'overflow-auto rounded-lg bg-slate-900 p-4 text-xs text-slate-100'
                  : 'whitespace-pre-wrap rounded-lg bg-gray-50 p-4 text-sm text-gray-700'
                }
              >
                {value}
              </pre>
            </div>
          )
        }

        return (
          <div key={key} className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-gray-500">
              <FileText className="h-3 w-3" />
              {key.replace(/_/g, ' ')}
            </div>
            <pre className="overflow-auto rounded-lg bg-gray-50 p-4 text-xs text-gray-700">
{JSON.stringify(value, null, 2)}
            </pre>
          </div>
        )
      })}
    </div>
  )
}
