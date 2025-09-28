'use client'

import { useState } from 'react'
import {
  ThumbsUp,
  ThumbsDown,
  MessageSquare,
  Send,
  Edit3,
  CheckCircle,
  XCircle,
  Clock,
  User,
  Calendar,
  Star,
  AlertCircle,
  RotateCcw,
  Save
} from 'lucide-react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'

import { ProjectReviewData } from '@/app/projects/[id]/review/page'

interface ReviewApprovalSectionProps {
  data: ProjectReviewData
  onApprove: (feedback?: string) => Promise<void>
  onRequestRevisions: (revisions: RevisionRequest) => Promise<void>
  onSubmitFeedback: (feedback: string, rating?: number) => Promise<void>
  isLoading: boolean
}

interface RevisionRequest {
  feedback: string
  categories: string[]
  priority: 'low' | 'medium' | 'high'
  deadline?: string
}

const revisionCategories = [
  { id: 'script', label: 'Script Content', description: 'Story, dialogue, structure' },
  { id: 'characters', label: 'Character Development', description: 'Character arcs, motivations' },
  { id: 'market', label: 'Market Positioning', description: 'Target audience, competitive analysis' },
  { id: 'pitch', label: 'Pitch Materials', description: 'Presentation, executive summary' },
  { id: 'visuals', label: 'Visual Elements', description: 'Design, branding, imagery' },
  { id: 'business', label: 'Business Plan', description: 'Financials, projections, strategy' }
]

export function ReviewApprovalSection({
  data,
  onApprove,
  onRequestRevisions,
  onSubmitFeedback,
  isLoading
}: ReviewApprovalSectionProps) {
  const [feedbackText, setFeedbackText] = useState('')
  const [rating, setRating] = useState<number>(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showRevisionDialog, setShowRevisionDialog] = useState(false)
  const [showApprovalDialog, setShowApprovalDialog] = useState(false)

  // Revision request state
  const [revisionData, setRevisionData] = useState<RevisionRequest>({
    feedback: '',
    categories: [],
    priority: 'medium',
    deadline: ''
  })

  const isProcessingComplete = data.processing_steps.length > 0 &&
    data.processing_steps.every(step => step.status === 'completed' || step.status === 'skipped')

  const hasErrors = data.processing_steps.some(step => step.status === 'failed')

  const handleSubmitFeedback = async () => {
    if (!feedbackText.trim()) return

    setIsSubmitting(true)
    try {
      await onSubmitFeedback(feedbackText, rating || undefined)
      setFeedbackText('')
      setRating(0)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleApprove = async () => {
    setIsSubmitting(true)
    try {
      await onApprove(feedbackText || undefined)
      setShowApprovalDialog(false)
      setFeedbackText('')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleRequestRevisions = async () => {
    if (!revisionData.feedback.trim() || revisionData.categories.length === 0) return

    setIsSubmitting(true)
    try {
      await onRequestRevisions(revisionData)
      setShowRevisionDialog(false)
      setRevisionData({
        feedback: '',
        categories: [],
        priority: 'medium',
        deadline: ''
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const toggleRevisionCategory = (categoryId: string) => {
    setRevisionData(prev => ({
      ...prev,
      categories: prev.categories.includes(categoryId)
        ? prev.categories.filter(id => id !== categoryId)
        : [...prev.categories, categoryId]
    }))
  }

  const getStatusBadge = (approved: boolean, hasRevisions: boolean) => {
    if (approved) {
      return <Badge className="bg-green-100 text-green-800 border-green-200">Approved</Badge>
    }
    if (hasRevisions) {
      return <Badge className="bg-amber-100 text-amber-800 border-amber-200">Revisions Requested</Badge>
    }
    return <Badge className="bg-gray-100 text-gray-800 border-gray-200">Pending Review</Badge>
  }

  return (
    <div className="space-y-6">
      {/* Project Status Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Project Review Status
          </CardTitle>
          <CardDescription>
            Current approval status and review progress
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Processing Status */}
            <div className="text-center p-4 bg-blue-50 rounded-lg border border-blue-200">
              {isProcessingComplete ? (
                <CheckCircle className="h-8 w-8 text-green-600 mx-auto mb-2" />
              ) : hasErrors ? (
                <XCircle className="h-8 w-8 text-red-600 mx-auto mb-2" />
              ) : (
                <Clock className="h-8 w-8 text-blue-600 mx-auto mb-2" />
              )}
              <h4 className="font-semibold text-gray-900">Processing</h4>
              <p className="text-sm text-gray-600 mt-1">
                {isProcessingComplete ? 'Complete' : hasErrors ? 'Has Errors' : 'In Progress'}
              </p>
            </div>

            {/* Review Status */}
            <div className="text-center p-4 bg-purple-50 rounded-lg border border-purple-200">
              <MessageSquare className="h-8 w-8 text-purple-600 mx-auto mb-2" />
              <h4 className="font-semibold text-gray-900">Review</h4>
              <div className="mt-1">
                {getStatusBadge(data.approval_status.approved, data.approval_status.revision_requests.length > 0)}
              </div>
            </div>

            {/* Approval Status */}
            <div className="text-center p-4 bg-green-50 rounded-lg border border-green-200">
              {data.approval_status.approved ? (
                <ThumbsUp className="h-8 w-8 text-green-600 mx-auto mb-2" />
              ) : (
                <Clock className="h-8 w-8 text-gray-600 mx-auto mb-2" />
              )}
              <h4 className="font-semibold text-gray-900">Approval</h4>
              <p className="text-sm text-gray-600 mt-1">
                {data.approval_status.approved ? 'Approved' : 'Pending'}
              </p>
            </div>
          </div>

          {/* Readiness Check */}
          {!isProcessingComplete && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-amber-600" />
                <span className="font-medium text-amber-900">Processing Not Complete</span>
              </div>
              <p className="text-amber-700 text-sm mt-1">
                AI processing must be completed before the project can be reviewed and approved.
              </p>
            </div>
          )}

          {hasErrors && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center gap-2">
                <XCircle className="h-5 w-5 text-red-600" />
                <span className="font-medium text-red-900">Processing Errors Detected</span>
              </div>
              <p className="text-red-700 text-sm mt-1">
                Some processing steps have failed. Please resolve errors before approval.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Feedback Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Edit3 className="h-5 w-5" />
            Provide Feedback
          </CardTitle>
          <CardDescription>
            Share your thoughts and feedback on the project
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Rating */}
          <div className="space-y-2">
            <Label>Overall Rating (Optional)</Label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => setRating(star)}
                  className={`p-1 rounded transition-colors ${
                    star <= rating ? 'text-yellow-500' : 'text-gray-300 hover:text-yellow-400'
                  }`}
                >
                  <Star className="h-6 w-6 fill-current" />
                </button>
              ))}
            </div>
            {rating > 0 && (
              <p className="text-sm text-gray-600">
                {rating}/5 stars
              </p>
            )}
          </div>

          {/* Feedback Text */}
          <div className="space-y-2">
            <Label htmlFor="feedback">Feedback & Comments</Label>
            <Textarea
              id="feedback"
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              placeholder="Share your thoughts on the project, script, generated materials, or any other feedback..."
              rows={4}
              className="resize-none"
            />
          </div>

          {/* Submit Feedback */}
          <div className="flex justify-end">
            <Button
              onClick={handleSubmitFeedback}
              disabled={!feedbackText.trim() || isSubmitting}
              variant="outline"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin mr-2" />
                  Submitting...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Submit Feedback
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      {isProcessingComplete && !hasErrors && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Review Actions</CardTitle>
            <CardDescription>
              Approve the project or request specific revisions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              {/* Approve Button */}
              <Dialog open={showApprovalDialog} onOpenChange={setShowApprovalDialog}>
                <DialogTrigger asChild>
                  <Button
                    className="flex-1 bg-green-600 hover:bg-green-700"
                    disabled={data.approval_status.approved || isLoading}
                  >
                    <ThumbsUp className="h-4 w-4 mr-2" />
                    {data.approval_status.approved ? 'Already Approved' : 'Approve Project'}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Approve Project</DialogTitle>
                    <DialogDescription>
                      Are you sure you want to approve this project? This will mark it as ready for production.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Final Comments (Optional)</Label>
                      <Textarea
                        value={feedbackText}
                        onChange={(e) => setFeedbackText(e.target.value)}
                        placeholder="Any final comments or notes for the approval..."
                        rows={3}
                      />
                    </div>
                    <div className="flex justify-end gap-3">
                      <Button
                        variant="outline"
                        onClick={() => setShowApprovalDialog(false)}
                        disabled={isSubmitting}
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleApprove}
                        disabled={isSubmitting}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        {isSubmitting ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                            Approving...
                          </>
                        ) : (
                          <>
                            <CheckCircle className="h-4 w-4 mr-2" />
                            Confirm Approval
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              {/* Request Revisions Button */}
              <Dialog open={showRevisionDialog} onOpenChange={setShowRevisionDialog}>
                <DialogTrigger asChild>
                  <Button
                    variant="outline"
                    className="flex-1 border-orange-300 text-orange-700 hover:bg-orange-50"
                    disabled={isLoading}
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Request Revisions
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Request Revisions</DialogTitle>
                    <DialogDescription>
                      Specify what needs to be revised and provide detailed feedback
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-6">
                    {/* Revision Categories */}
                    <div className="space-y-3">
                      <Label>Areas for Revision</Label>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {revisionCategories.map((category) => (
                          <div
                            key={category.id}
                            className="flex items-start space-x-2 p-3 border rounded-lg hover:bg-gray-50"
                          >
                            <Checkbox
                              id={category.id}
                              checked={revisionData.categories.includes(category.id)}
                              onCheckedChange={() => toggleRevisionCategory(category.id)}
                            />
                            <div className="flex-1">
                              <label
                                htmlFor={category.id}
                                className="text-sm font-medium cursor-pointer"
                              >
                                {category.label}
                              </label>
                              <p className="text-xs text-gray-600">{category.description}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Detailed Feedback */}
                    <div className="space-y-2">
                      <Label>Detailed Feedback *</Label>
                      <Textarea
                        value={revisionData.feedback}
                        onChange={(e) => setRevisionData(prev => ({ ...prev, feedback: e.target.value }))}
                        placeholder="Provide specific, actionable feedback on what needs to be revised..."
                        rows={4}
                        className="resize-none"
                      />
                    </div>

                    {/* Priority */}
                    <div className="space-y-2">
                      <Label>Priority Level</Label>
                      <div className="flex gap-2">
                        {(['low', 'medium', 'high'] as const).map((priority) => (
                          <Button
                            key={priority}
                            variant={revisionData.priority === priority ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setRevisionData(prev => ({ ...prev, priority }))}
                          >
                            {priority.charAt(0).toUpperCase() + priority.slice(1)}
                          </Button>
                        ))}
                      </div>
                    </div>

                    {/* Deadline */}
                    <div className="space-y-2">
                      <Label>Revision Deadline (Optional)</Label>
                      <Input
                        type="date"
                        value={revisionData.deadline}
                        onChange={(e) => setRevisionData(prev => ({ ...prev, deadline: e.target.value }))}
                        min={new Date().toISOString().split('T')[0]}
                      />
                    </div>

                    {/* Actions */}
                    <div className="flex justify-end gap-3">
                      <Button
                        variant="outline"
                        onClick={() => setShowRevisionDialog(false)}
                        disabled={isSubmitting}
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleRequestRevisions}
                        disabled={!revisionData.feedback.trim() || revisionData.categories.length === 0 || isSubmitting}
                        className="bg-orange-600 hover:bg-orange-700"
                      >
                        {isSubmitting ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                            Submitting...
                          </>
                        ) : (
                          <>
                            <Send className="h-4 w-4 mr-2" />
                            Send Revision Request
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Review History */}
      {(data.approval_status.feedback.length > 0 || data.approval_status.revision_requests.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Review History</CardTitle>
            <CardDescription>
              Previous feedback and revision requests
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Approval Status */}
              {data.approval_status.approved && (
                <div className="border border-green-200 bg-green-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    <span className="font-semibold text-green-900">Project Approved</span>
                  </div>
                  <div className="text-sm text-green-700">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      {data.approval_status.approved_at && (
                        <span>Approved on {new Date(data.approval_status.approved_at).toLocaleDateString()}</span>
                      )}
                    </div>
                    {data.approval_status.approved_by && (
                      <div className="flex items-center gap-2 mt-1">
                        <User className="h-4 w-4" />
                        <span>Approved by {data.approval_status.approved_by}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Mock feedback and revision history for demo */}
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <MessageSquare className="h-5 w-5 text-blue-600" />
                  <span className="font-semibold">Initial Review</span>
                  <Badge variant="outline" className="text-xs">System Generated</Badge>
                </div>
                <p className="text-sm text-gray-700 mb-2">
                  Project shows strong potential with well-developed characters and market-ready positioning.
                  All AI-generated materials meet quality standards.
                </p>
                <div className="text-xs text-gray-500">
                  <Calendar className="h-3 w-3 inline mr-1" />
                  {new Date().toLocaleDateString()}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}