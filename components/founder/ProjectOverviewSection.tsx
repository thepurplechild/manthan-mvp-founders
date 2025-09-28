'use client'

import { useState } from 'react'
import {
  Edit2,
  Save,
  X,
  Calendar,
  User,
  Tag,
  FileText,
  Star,
  TrendingUp,
  Clock,
  CheckCircle2
} from 'lucide-react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

import { ProjectReviewData } from '@/app/projects/[id]/review/page'

interface ProjectOverviewSectionProps {
  data: ProjectReviewData
  onUpdate: (updates: { title?: string; description?: string }) => Promise<void>
  isLoading: boolean
}

export function ProjectOverviewSection({
  data,
  onUpdate,
  isLoading
}: ProjectOverviewSectionProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editData, setEditData] = useState({
    title: data.project.title,
    description: data.project.description || ''
  })
  const [isSaving, setIsSaving] = useState(false)

  const handleSave = async () => {
    if (isSaving) return

    setIsSaving(true)
    try {
      await onUpdate(editData)
      setIsEditing(false)
    } catch (error) {
      console.error('Failed to update project:', error)
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancel = () => {
    setEditData({
      title: data.project.title,
      description: data.project.description || ''
    })
    setIsEditing(false)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-5 w-5 text-green-600" />
      case 'processing':
        return <Clock className="h-5 w-5 text-blue-600 animate-pulse" />
      case 'approved':
        return <Star className="h-5 w-5 text-yellow-600" />
      default:
        return <FileText className="h-5 w-5 text-gray-600" />
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Project Details - Main Card */}
      <Card className="lg:col-span-2">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-6">
          <div>
            <CardTitle className="text-2xl">Project Information</CardTitle>
            <CardDescription>
              Basic project details and metadata
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsEditing(!isEditing)}
            disabled={isLoading || isSaving}
          >
            {isEditing ? (
              <>
                <X className="h-4 w-4 mr-2" />
                Cancel
              </>
            ) : (
              <>
                <Edit2 className="h-4 w-4 mr-2" />
                Edit
              </>
            )}
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title" className="text-sm font-medium">
              Project Title
            </Label>
            {isEditing ? (
              <Input
                id="title"
                value={editData.title}
                onChange={(e) =>
                  setEditData({ ...editData, title: e.target.value })
                }
                placeholder="Enter project title"
                className="text-lg font-semibold"
              />
            ) : (
              <h2 className="text-xl font-semibold text-gray-900">
                {data.project.title}
              </h2>
            )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description" className="text-sm font-medium">
              Description
            </Label>
            {isEditing ? (
              <Textarea
                id="description"
                value={editData.description}
                onChange={(e) =>
                  setEditData({ ...editData, description: e.target.value })
                }
                placeholder="Enter project description"
                rows={4}
                className="resize-none"
              />
            ) : (
              <p className="text-gray-700 leading-relaxed">
                {data.project.description || (
                  <span className="text-gray-400 italic">
                    No description provided
                  </span>
                )}
              </p>
            )}
          </div>

          {/* Logline */}
          {data.project.logline && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Logline</Label>
              <p className="text-gray-700 bg-gray-50 p-3 rounded-lg border">
                {data.project.logline}
              </p>
            </div>
          )}

          {/* Synopsis */}
          {data.project.synopsis && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Synopsis</Label>
              <p className="text-gray-700 bg-gray-50 p-3 rounded-lg border leading-relaxed">
                {data.project.synopsis}
              </p>
            </div>
          )}

          {/* Genres */}
          {data.project.genre && data.project.genre.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-2">
                <Tag className="h-4 w-4" />
                Genres
              </Label>
              <div className="flex flex-wrap gap-2">
                {data.project.genre.map((genre, index) => (
                  <Badge
                    key={index}
                    variant="secondary"
                    className="bg-blue-100 text-blue-800 border-blue-200"
                  >
                    {genre}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Save/Cancel buttons when editing */}
          {isEditing && (
            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button
                variant="outline"
                onClick={handleCancel}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={isSaving}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {isSaving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save Changes
                  </>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Project Metadata - Sidebar */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Project Status</CardTitle>
          <CardDescription>
            Current status and timeline information
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Current Status */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Current Status</Label>
            <div className="flex items-center gap-2">
              {getStatusIcon(data.project.status)}
              <Badge className="capitalize">
                {data.project.status.replace('_', ' ')}
              </Badge>
            </div>
          </div>

          {/* Quality Score */}
          {data.project.quality_score !== null && (
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Quality Score
              </Label>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-gradient-to-r from-red-500 via-yellow-500 to-green-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${data.project.quality_score}%` }}
                  />
                </div>
                <span className="text-sm font-medium">
                  {Math.round(data.project.quality_score)}%
                </span>
              </div>
            </div>
          )}

          {/* Created Date */}
          <div className="space-y-2">
            <Label className="text-sm font-medium flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Created
            </Label>
            <p className="text-sm text-gray-600">
              {formatDate(data.project.created_at)}
            </p>
          </div>

          {/* Last Updated */}
          <div className="space-y-2">
            <Label className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Last Updated
            </Label>
            <p className="text-sm text-gray-600">
              {formatDate(data.project.updated_at)}
            </p>
          </div>

          {/* Last Processing Run */}
          {data.project.last_run_at && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Last Processing Run</Label>
              <p className="text-sm text-gray-600">
                {formatDate(data.project.last_run_at)}
              </p>
            </div>
          )}

          {/* Project ID (for debugging) */}
          <div className="space-y-2 pt-4 border-t">
            <Label className="text-sm font-medium text-gray-500">Project ID</Label>
            <p className="text-xs text-gray-400 font-mono">
              {data.project.id}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Progress Summary Card */}
      <Card className="lg:col-span-3">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Project Progress Summary
          </CardTitle>
          <CardDescription>
            Overview of processing stages and current status
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Scripts */}
            <div className="text-center p-4 bg-blue-50 rounded-lg border border-blue-200">
              <FileText className="h-8 w-8 text-blue-600 mx-auto mb-2" />
              <h4 className="font-semibold text-blue-900">Scripts</h4>
              <p className="text-2xl font-bold text-blue-800">
                {data.ingestions.length}
              </p>
              <p className="text-sm text-blue-600">Uploaded</p>
            </div>

            {/* Processing */}
            <div className="text-center p-4 bg-purple-50 rounded-lg border border-purple-200">
              <TrendingUp className="h-8 w-8 text-purple-600 mx-auto mb-2" />
              <h4 className="font-semibold text-purple-900">Processing</h4>
              <p className="text-2xl font-bold text-purple-800">
                {data.processing_steps.filter(s => s.status === 'completed').length}/
                {data.processing_steps.length}
              </p>
              <p className="text-sm text-purple-600">Steps Complete</p>
            </div>

            {/* Assets */}
            <div className="text-center p-4 bg-green-50 rounded-lg border border-green-200">
              <CheckCircle2 className="h-8 w-8 text-green-600 mx-auto mb-2" />
              <h4 className="font-semibold text-green-900">Assets</h4>
              <p className="text-2xl font-bold text-green-800">
                {data.generated_assets.length}
              </p>
              <p className="text-sm text-green-600">Generated</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}