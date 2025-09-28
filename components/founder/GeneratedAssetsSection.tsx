'use client'

import { useState } from 'react'
import {
  Archive,
  Copy,
  Download,
  Eye,
  FileText,
  Folder,
  Package,
  Palette,
  Presentation,
  RefreshCw,
  TrendingUp,
  Users,
} from 'lucide-react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

import type { ProjectReviewData, ReviewGeneratedAsset, ReviewPackage } from '@/types/review'

interface GeneratedAssetsSectionProps {
  data: ProjectReviewData
  onRefresh: () => void
  isLoading: boolean
}

interface AssetPreview {
  type: string
  url: string
  content?: string
  loading: boolean
  error?: string
}

const assetCatalog: Record<string, {
  name: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  color: string
}> = {
  pdf_pitch: {
    name: 'Pitch Deck (PDF)',
    description: 'Ready-to-share PDF version of the pitch deck.',
    icon: Presentation,
    color: 'bg-red-100 text-red-600',
  },
  pptx_pitch: {
    name: 'Pitch Deck (PowerPoint)',
    description: 'Editable PowerPoint presentation for customisation.',
    icon: Presentation,
    color: 'bg-orange-100 text-orange-600',
  },
  exec_summary: {
    name: 'Executive Summary',
    description: 'Concise summary document highlighting key points.',
    icon: FileText,
    color: 'bg-blue-100 text-blue-600',
  },
  market_analysis: {
    name: 'Market Analysis',
    description: 'Market landscape and positioning insights.',
    icon: TrendingUp,
    color: 'bg-green-100 text-green-600',
  },
  character_profiles: {
    name: 'Character Profiles',
    description: 'Character arcs, motivations, and casting notes.',
    icon: Users,
    color: 'bg-purple-100 text-purple-600',
  },
  visual_assets: {
    name: 'Visual Assets',
    description: 'Moodboards, style frames, and brand imagery.',
    icon: Palette,
    color: 'bg-pink-100 text-pink-600',
  },
}

const fallbackAssetMeta = {
  name: 'Generated Asset',
  description: 'File produced by the AI workflow.',
  icon: FileText,
  color: 'bg-gray-100 text-gray-600',
}

export function GeneratedAssetsSection({ data, onRefresh, isLoading }: GeneratedAssetsSectionProps) {
  const [previewAsset, setPreviewAsset] = useState<AssetPreview | null>(null)
  const [copiedAssetId, setCopiedAssetId] = useState<string | null>(null)

  const groupedAssets = groupAssetsByKind(data.generated_assets)
  const totalSize = data.generated_assets.reduce((acc, asset) => acc + (asset.bytes || 0), 0)

  const handleCopyLink = async (asset: ReviewGeneratedAsset) => {
    try {
      await navigator.clipboard.writeText(asset.storage_path)
      setCopiedAssetId(asset.id)
      setTimeout(() => setCopiedAssetId(null), 2000)
    } catch (error) {
      console.error('[GeneratedAssetsSection] failed to copy asset URL', error)
    }
  }

  const handlePreview = async (asset: ReviewGeneratedAsset) => {
    setPreviewAsset({ type: asset.kind, url: asset.storage_path, loading: true })

    try {
      // Placeholder: in production fetch signed URL or preview asset content.
      await new Promise((resolve) => setTimeout(resolve, 800))

      const preview = buildPreviewPlaceholder(asset.kind, data.project.title)
      setPreviewAsset({
        type: asset.kind,
        url: asset.storage_path,
        content: preview,
        loading: false,
      })
    } catch {
      setPreviewAsset({
        type: asset.kind,
        url: asset.storage_path,
        loading: false,
        error: 'Unable to load preview',
      })
    }
  }

  const handleDownload = (asset: ReviewGeneratedAsset) => {
    const link = document.createElement('a')
    link.href = asset.storage_path
    link.download = inferFileName(asset)
    link.target = '_blank'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  if (data.generated_assets.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
            <Package className="h-8 w-8 text-gray-400" />
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-gray-900">No assets generated yet</h3>
            <p className="text-sm text-gray-600 max-w-md mx-auto">
              Once the AI workflow completes, pitch decks, summaries, and supporting documents will be available here.
            </p>
          </div>
          <Button variant="outline" onClick={onRefresh} disabled={isLoading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Check for updates
          </Button>
        </CardContent>
      </Card>
    )
  }

  const defaultTab = Object.keys(groupedAssets)[0]

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard label="Total assets" value={data.generated_assets.length} icon={Package} accent="text-blue-600" />
        <StatCard label="Asset types" value={Object.keys(groupedAssets).length} icon={Folder} accent="text-green-600" />
        <StatCard label="Total size" value={formatFileSize(totalSize)} icon={Archive} accent="text-purple-600" />
      </div>

      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle className="text-xl">Generated assets</CardTitle>
            <CardDescription>Structured deliverables from the AI packaging pipeline.</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue={defaultTab} className="space-y-6">
            <TabsList className="flex w-full flex-wrap gap-2">
              {Object.keys(groupedAssets).map((kind) => {
                const meta = assetCatalog[kind] || fallbackAssetMeta
                const Icon = meta.icon
                return (
                  <TabsTrigger key={kind} value={kind} className="flex items-center gap-2 rounded-full border px-4 py-2 text-sm">
                    <Icon className="h-4 w-4" />
                    {meta.name}
                    <Badge variant="secondary" className="ml-1">
                      {groupedAssets[kind].length}
                    </Badge>
                  </TabsTrigger>
                )
              })}
            </TabsList>

            {Object.entries(groupedAssets).map(([kind, assets]) => {
              const meta = assetCatalog[kind] || fallbackAssetMeta
              const Icon = meta.icon

              return (
                <TabsContent key={kind} value={kind} className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className={`rounded-lg p-2 ${meta.color}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{meta.name}</h3>
                      <p className="text-sm text-gray-600">{meta.description}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    {assets.map((asset, index) => (
                      <Card key={asset.id} className="transition-shadow hover:shadow-md">
                        <CardContent className="space-y-4 pt-4">
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="font-medium text-gray-900">{inferFileName(asset)}</p>
                              <p className="text-sm text-gray-600">{formatFileSize(asset.bytes)}</p>
                            </div>
                            <Badge variant="outline">v{index + 1}</Badge>
                          </div>

                          <div className="space-y-2 text-xs text-gray-500">
                            <div className="flex justify-between">
                              <span>Created</span>
                              <span>{new Date(asset.created_at).toLocaleString()}</span>
                            </div>
                            {asset.status && (
                              <div className="flex justify-between">
                                <span>Status</span>
                                <span className="capitalize">{asset.status.replace('_', ' ')}</span>
                              </div>
                            )}
                          </div>

                          <div className="flex gap-2">
                            <Button variant="outline" size="sm" className="flex-1" onClick={() => handlePreview(asset)}>
                              <Eye className="mr-2 h-4 w-4" />
                              Preview
                            </Button>
                            <Button variant="outline" size="sm" className="flex-1" onClick={() => handleDownload(asset)}>
                              <Download className="mr-2 h-4 w-4" />
                              Download
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1"
                              onClick={() => handleCopyLink(asset)}
                            >
                              <Copy className="mr-2 h-4 w-4" />
                              {copiedAssetId === asset.id ? 'Copied!' : 'Copy link'}
                            </Button>
                          </div>
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

      {data.packages.length > 0 && (
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-start justify-between">
            <div>
              <CardTitle className="text-xl">Distribution packages</CardTitle>
              <CardDescription>Bundled outputs prepared for stakeholder delivery.</CardDescription>
            </div>
            <Badge variant="secondary">{data.packages.length}</Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.packages.map((pkg) => (
              <PackageCard key={pkg.id} pkg={pkg} />
            ))}
          </CardContent>
        </Card>
      )}

      {previewAsset && (
        <Dialog open={!!previewAsset} onOpenChange={(open) => !open && setPreviewAsset(null)}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Preview: {previewAsset.type.replace(/_/g, ' ')}</DialogTitle>
              <DialogDescription>
                Quick look at {previewAsset.type.replace(/_/g, ' ')}. Use the download button for the full asset.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4">
              {previewAsset.loading && (
                <div className="rounded-lg border border-gray-200 p-10 text-center text-sm text-gray-500">
                  Preparing preview…
                </div>
              )}
              {previewAsset.error && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600">
                  {previewAsset.error}
                </div>
              )}
              {previewAsset.content && (
                <pre className="max-h-[400px] overflow-auto rounded-lg bg-gray-50 p-4 text-sm text-gray-700 whitespace-pre-wrap">
{previewAsset.content}
                </pre>
              )}
              <div className="flex justify-end">
                <Button variant="outline" onClick={() => setPreviewAsset(null)}>
                  Close
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

function groupAssetsByKind(assets: ReviewGeneratedAsset[]) {
  const grouped: Record<string, ReviewGeneratedAsset[]> = {}
  assets.forEach((asset) => {
    const key = asset.kind || 'asset'
    if (!grouped[key]) {
      grouped[key] = []
    }
    grouped[key].push(asset)
  })
  Object.keys(grouped).forEach((key) => {
    grouped[key].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  })
  return grouped
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return 'Unknown size'
  const units = ['B', 'KB', 'MB', 'GB']
  let size = bytes
  let unitIndex = 0
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }
  return `${size.toFixed(1)} ${units[unitIndex]}`
}

function inferFileName(asset: ReviewGeneratedAsset): string {
  const candidate = asset.file_name || asset.storage_path.split('/').pop() || `${asset.kind}.asset`
  return candidate
}

function buildPreviewPlaceholder(kind: string, title: string): string {
  switch (kind) {
    case 'exec_summary':
      return `Executive Summary for ${title}\n\n• Key themes and unique selling points\n• Audience appeal and franchise potential\n• High-level financial projections and ROI`
    case 'market_analysis':
      return `Market Analysis\n\nSegment trends, competitor positioning, and platform opportunities. Tailored recommendations for release strategy.`
    case 'pdf_pitch':
    case 'pptx_pitch':
      return `Pitch Deck Overview\n\nSlide outline and talking points summarised for quick review.`
    default:
      return `Preview unavailable for asset type “${kind}”. Download the asset to review the full content.`
  }
}

function StatCard({ label, value, icon: Icon, accent }: { label: string; value: string | number; icon: React.ComponentType<{ className?: string }>; accent: string }) {
  return (
    <Card className="shadow-sm">
      <CardContent className="flex items-center justify-between pt-6">
        <div>
          <p className="text-sm font-medium text-gray-600">{label}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
        </div>
        <Icon className={`h-8 w-8 ${accent}`} />
      </CardContent>
    </Card>
  )
}

function PackageCard({ pkg }: { pkg: ReviewPackage }) {
  const summaryEntries = pkg.summary ? Object.entries(pkg.summary).slice(0, 3) : []

  return (
    <div className="rounded-lg border border-gray-200 p-4 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-900">Package #{pkg.id.slice(0, 8)}</p>
          <p className="text-xs text-gray-500">Generated {new Date(pkg.created_at).toLocaleString()}</p>
        </div>
        <div className="flex gap-2">
          {pkg.deck_url && (
            <Button asChild variant="outline" size="sm">
              <a href={pkg.deck_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2">
                <Presentation className="h-4 w-4" />
                Deck
              </a>
            </Button>
          )}
          {pkg.document_url && (
            <Button asChild variant="outline" size="sm">
              <a href={pkg.document_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Document
              </a>
            </Button>
          )}
        </div>
      </div>

      {summaryEntries.length > 0 && (
        <div className="mt-4 space-y-2 text-xs text-gray-600">
          {summaryEntries.map(([key, value]) => (
            <div key={key} className="rounded bg-gray-50 p-3">
              <p className="font-semibold text-gray-700">{key.replace(/_/g, ' ')}</p>
              <p className="mt-1 text-gray-600">
                {typeof value === 'string' ? value : JSON.stringify(value)}
              </p>
            </div>
          ))}
        </div>
      )}

      {pkg.artifacts && Object.keys(pkg.artifacts).length > 0 && (
        <div className="mt-4 text-xs text-gray-500">
          Additional artifacts available ({Object.keys(pkg.artifacts).length})
        </div>
      )}
    </div>
  )
}
