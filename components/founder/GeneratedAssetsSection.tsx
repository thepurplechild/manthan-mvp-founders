'use client'

import { useState } from 'react'
import {
  Download,
  Eye,
  FileText,
  Image,
  Presentation,
  Calendar,
  Folder,
  ExternalLink,
  Copy,
  Check,
  Package,
  TrendingUp,
  Users,
  Palette,
  Archive,
  RefreshCw
} from 'lucide-react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'

import { ProjectReviewData } from '@/app/projects/[id]/review/page'

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

export function GeneratedAssetsSection({
  data,
  onRefresh,
  isLoading
}: GeneratedAssetsSectionProps) {
  const [previewAsset, setPreviewAsset] = useState<AssetPreview | null>(null)
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null)

  const assetTypes = {
    pdf_pitch: {
      name: 'Pitch Deck (PDF)',
      icon: Presentation,
      color: 'text-red-600 bg-red-100',
      description: 'Professional pitch deck in PDF format'
    },
    pptx_pitch: {
      name: 'Pitch Deck (PowerPoint)',
      icon: Presentation,
      color: 'text-orange-600 bg-orange-100',
      description: 'Editable PowerPoint presentation'
    },
    exec_summary: {
      name: 'Executive Summary',
      icon: FileText,
      color: 'text-blue-600 bg-blue-100',
      description: 'Comprehensive executive summary document'
    },
    market_analysis: {
      name: 'Market Analysis',
      icon: TrendingUp,
      color: 'text-green-600 bg-green-100',
      description: 'Market research and analysis report'
    },
    character_profiles: {
      name: 'Character Profiles',
      icon: Users,
      color: 'text-purple-600 bg-purple-100',
      description: 'Detailed character development profiles'
    },
    visual_assets: {
      name: 'Visual Assets',
      icon: Palette,
      color: 'text-pink-600 bg-pink-100',
      description: 'Visual elements and design assets'
    }
  }

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

  const groupAssetsByType = () => {
    const grouped: Record<string, any[]> = {}

    data.generated_assets.forEach(asset => {
      if (!grouped[asset.kind]) {
        grouped[asset.kind] = []
      }
      grouped[asset.kind].push(asset)
    })

    // Sort by creation date within each group
    Object.keys(grouped).forEach(key => {
      grouped[key].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    })

    return grouped
  }

  const previewAssetContent = async (asset: any) => {
    setPreviewAsset({ type: asset.kind, url: asset.storage_path, loading: true })

    try {
      // Simulate loading preview content
      await new Promise(resolve => setTimeout(resolve, 1500))

      // Mock preview content based on type
      let content = ''
      switch (asset.kind) {
        case 'exec_summary':
          content = `# Executive Summary: ${data.project.title}

## Project Overview
${data.project.description || 'A compelling narrative that captures the essence of modern storytelling.'}

## Market Opportunity
The Indian content market is experiencing unprecedented growth, with streaming platforms investing heavily in original content. This project addresses a key gap in the market for authentic, culturally relevant storytelling.

## Key Highlights
- Strong character development with universal appeal
- Culturally authentic narrative rooted in Indian context
- Commercial viability across multiple platforms
- Scalable franchise potential

## Financial Projections
- Production Budget: ₹15-20 Crores
- Expected ROI: 180-220%
- Break-even: 18 months
- Revenue Streams: OTT licensing, theatrical, merchandise

## Next Steps
1. Finalize script development
2. Secure lead cast and director
3. Complete pre-production planning
4. Begin production Q2 2024

This executive summary provides a comprehensive overview of the project's commercial and creative potential.`
          break
        case 'market_analysis':
          content = `# Market Analysis Report

## Industry Overview
The Indian entertainment industry is valued at ₹1.8 trillion and growing at 10% CAGR.

## Target Audience Demographics
- Primary: Ages 18-35
- Income: Middle to upper-middle class
- Platforms: OTT-first consumption
- Preferences: Authentic storytelling, strong narratives

## Competitive Landscape
Analysis of similar content and positioning strategy...

## Revenue Projections
Detailed financial modeling and market penetration analysis...`
          break
        default:
          content = `Preview for ${asset.kind} asset.\n\nThis is a sample preview of the generated content. In a real implementation, this would show the actual content of the file or a rendered preview.`
      }

      setPreviewAsset({
        type: asset.kind,
        url: asset.storage_path,
        content,
        loading: false
      })
    } catch (error) {
      setPreviewAsset({
        type: asset.kind,
        url: asset.storage_path,
        loading: false,
        error: 'Failed to load preview'
      })
    }
  }

  const downloadAsset = (asset: any) => {
    // In a real implementation, this would trigger a secure download
    const link = document.createElement('a')
    link.href = asset.storage_path
    link.download = `${asset.kind}_${data.project.title}.${asset.kind.includes('pdf') ? 'pdf' : asset.kind.includes('pptx') ? 'pptx' : 'docx'}`
    link.click()
  }

  const copyAssetUrl = async (url: string, id: string) => {
    try {
      await navigator.clipboard.writeText(url)
      setCopiedUrl(id)
      setTimeout(() => setCopiedUrl(null), 2000)
    } catch (error) {
      console.error('Failed to copy URL:', error)
    }
  }

  const groupedAssets = groupAssetsByType()
  const totalAssets = data.generated_assets.length
  const totalSize = data.generated_assets.reduce((acc, asset) => acc + (asset.bytes || 0), 0)

  if (totalAssets === 0) {
    return (
      <Card>
        <CardContent className="pt-12 pb-12">
          <div className="text-center space-y-4">
            <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
              <Package className="h-8 w-8 text-gray-400" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-semibold text-gray-900">No Assets Generated</h3>
              <p className="text-gray-600 max-w-md mx-auto">
                Assets will appear here once the AI processing pipeline completes. Upload a script to begin generation.
              </p>
            </div>
            <Button onClick={onRefresh} variant="outline">
              <RefreshCw className="h-4 w-4 mr-2" />
              Check for Updates
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Assets Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Assets</p>
                <p className="text-2xl font-bold text-gray-900">{totalAssets}</p>
              </div>
              <Package className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Asset Types</p>
                <p className="text-2xl font-bold text-gray-900">{Object.keys(groupedAssets).length}</p>
              </div>
              <Folder className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Size</p>
                <p className="text-2xl font-bold text-gray-900">{formatFileSize(totalSize)}</p>
              </div>
              <Archive className="h-8 w-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Assets by Type */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-xl">Generated Assets</CardTitle>
            <CardDescription>
              All assets generated by the AI processing pipeline
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue={Object.keys(groupedAssets)[0]} className="space-y-6">
            <TabsList className="grid w-full grid-cols-auto">
              {Object.keys(groupedAssets).map(assetType => {
                const typeConfig = assetTypes[assetType as keyof typeof assetTypes]
                const IconComponent = typeConfig?.icon || FileText

                return (
                  <TabsTrigger key={assetType} value={assetType} className="flex items-center gap-2">
                    <IconComponent className="h-4 w-4" />
                    {typeConfig?.name || assetType}
                    <Badge variant="secondary" className="ml-1">
                      {groupedAssets[assetType].length}
                    </Badge>
                  </TabsTrigger>
                )
              })}
            </TabsList>

            {Object.entries(groupedAssets).map(([assetType, assets]) => {
              const typeConfig = assetTypes[assetType as keyof typeof assetTypes]
              const IconComponent = typeConfig?.icon || FileText

              return (
                <TabsContent key={assetType} value={assetType} className="space-y-4">
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`p-2 rounded-lg ${typeConfig?.color || 'text-gray-600 bg-gray-100'}`}>
                      <IconComponent className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold">{typeConfig?.name || assetType}</h3>
                      <p className="text-sm text-gray-600">{typeConfig?.description}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {assets.map((asset, index) => (
                      <Card key={asset.id} className="hover:shadow-md transition-shadow">
                        <CardContent className="pt-4">
                          <div className="space-y-4">
                            {/* Asset Header */}
                            <div className="flex items-start justify-between">
                              <div className="flex items-center gap-3">
                                <div className={`p-2 rounded ${typeConfig?.color || 'text-gray-600 bg-gray-100'}`}>
                                  <IconComponent className="h-4 w-4" />
                                </div>
                                <div>
                                  <h4 className="font-medium">
                                    {typeConfig?.name || assetType} {assets.length > 1 ? `#${index + 1}` : ''}
                                  </h4>
                                  <p className="text-sm text-gray-600">
                                    {formatFileSize(asset.bytes)}
                                  </p>
                                </div>
                              </div>
                              <Badge variant="outline" className="text-xs">
                                v{index + 1}
                              </Badge>
                            </div>

                            {/* Asset Metadata */}
                            <div className="space-y-2 text-sm">
                              <div className="flex justify-between">
                                <span className="text-gray-600">Created:</span>
                                <span>{new Date(asset.created_at).toLocaleDateString()}</span>
                              </div>
                              {asset.sha256 && (
                                <div className="flex justify-between">
                                  <span className="text-gray-600">Checksum:</span>
                                  <span className="font-mono text-xs">
                                    {asset.sha256.substring(0, 8)}...
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Actions */}
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => previewAssetContent(asset)}
                                className="flex-1"
                              >
                                <Eye className="h-4 w-4 mr-2" />
                                Preview
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => downloadAsset(asset)}
                                className="flex-1"
                              >
                                <Download className="h-4 w-4 mr-2" />
                                Download
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => copyAssetUrl(asset.storage_path, asset.id)}
                              >
                                {copiedUrl === asset.id ? (
                                  <Check className="h-4 w-4 text-green-600" />
                                ) : (
                                  <Copy className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
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

      {/* Asset Preview Dialog */}
      {previewAsset && (
        <Dialog open={!!previewAsset} onOpenChange={() => setPreviewAsset(null)}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {previewAsset.type && assetTypes[previewAsset.type as keyof typeof assetTypes] && (
                  <>
                    {(() => {
                      const IconComponent = assetTypes[previewAsset.type as keyof typeof assetTypes].icon
                      return <IconComponent className="h-5 w-5" />
                    })()}
                    {assetTypes[previewAsset.type as keyof typeof assetTypes].name}
                  </>
                )}
              </DialogTitle>
              <DialogDescription>
                Preview of generated asset content
              </DialogDescription>
            </DialogHeader>

            <div className="mt-4">
              {previewAsset.loading ? (
                <div className="text-center py-12">
                  <div className="w-8 h-8 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-gray-500">Loading preview...</p>
                </div>
              ) : previewAsset.error ? (
                <div className="text-center py-12 border border-red-200 rounded-lg bg-red-50">
                  <p className="text-red-600">{previewAsset.error}</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-gray-50 rounded-lg p-4">
                    <pre className="whitespace-pre-wrap text-sm font-mono leading-relaxed max-h-96 overflow-auto">
                      {previewAsset.content}
                    </pre>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      onClick={() => copyAssetUrl(previewAsset.content || '', 'preview')}
                    >
                      <Copy className="h-4 w-4 mr-2" />
                      Copy Content
                    </Button>
                    <Button onClick={() => window.open(previewAsset.url, '_blank')}>
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Open Original
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Bulk Download */}
      {totalAssets > 1 && (
        <Card className="border-dashed border-2 border-blue-300 bg-blue-50">
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <Archive className="h-8 w-8 text-blue-600 mx-auto" />
              <div>
                <h3 className="text-lg font-semibold text-blue-900">Download All Assets</h3>
                <p className="text-blue-700">
                  Download all generated assets as a single ZIP package
                </p>
              </div>
              <Button className="bg-blue-600 hover:bg-blue-700">
                <Download className="h-4 w-4 mr-2" />
                Download Package ({formatFileSize(totalSize)})
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}