import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import Link from "next/link"
import { getServerClient } from "@/lib/supabase/server"
import { MandateSchema } from "@/lib/zod/mandates"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ArrowLeft, Building2, Plus } from "lucide-react"

// Server Action for creating mandates
async function createMandateAction(formData: FormData) {
  'use server'

  // Parse and validate the form data
  const parsed = MandateSchema.safeParse({
    platform_name: formData.get('platform_name'),
    mandate_description: formData.get('mandate_description'),
    tags: formData.get('tags'),
    source: formData.get('source'),
  })

  if (!parsed.success) {
    // In a real app, you'd handle validation errors better
    throw new Error(parsed.error.issues[0]?.message || 'Invalid form data')
  }

  const supabase = getServerClient()

  // Get the current user to set as created_by
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    throw new Error('User not authenticated')
  }

  // Insert the new mandate
  const { error } = await supabase
    .from('platform_mandates')
    .insert({
      platform_name: parsed.data.platform_name,
      mandate_description: parsed.data.mandate_description,
      tags: parsed.data.tags,
      source: parsed.data.source || null,
      created_by: user.id,
    })

  if (error) {
    throw new Error(`Failed to create mandate: ${error.message}`)
  }

  // Revalidate the dashboard and mandates pages
  revalidatePath('/founder/dashboard')
  revalidatePath('/founder/mandates')

  // Redirect to the dashboard with success
  redirect('/founder/dashboard?tab=mandates&created=true')
}

export default function NewMandatePage() {
  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      {/* Header */}
      <div className="flex flex-col gap-4 mb-8">
        <Link
          href="/founder/dashboard"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors w-fit"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>

        <div>
          <h1 className="text-3xl font-bold tracking-tight">Create Platform Mandate</h1>
          <p className="text-muted-foreground">
            Add market intelligence and platform requirements to help match projects with buyers
          </p>
        </div>
      </div>

      {/* Form Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Platform Mandate Details
          </CardTitle>
          <CardDescription>
            Capture specific requirements, preferences, and intelligence about streaming platforms and buyers
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createMandateAction} className="space-y-6">
            {/* Platform Name */}
            <div className="space-y-2">
              <Label htmlFor="platform_name">Platform Name</Label>
              <Input
                id="platform_name"
                name="platform_name"
                type="text"
                placeholder="e.g., Netflix, Amazon Prime, Sony LIV"
                required
                className="w-full"
              />
              <p className="text-sm text-muted-foreground">
                The name of the streaming platform or production house
              </p>
            </div>

            {/* Mandate Description */}
            <div className="space-y-2">
              <Label htmlFor="mandate_description">Mandate Description</Label>
              <Textarea
                id="mandate_description"
                name="mandate_description"
                rows={6}
                placeholder="Describe the platform's content requirements, preferences, target audience, recent acquisitions, upcoming slate needs, budget ranges, etc."
                required
                className="w-full resize-vertical"
              />
              <p className="text-sm text-muted-foreground">
                Detailed information about what the platform is looking for in content
              </p>
            </div>

            {/* Tags */}
            <div className="space-y-2">
              <Label htmlFor="tags">Tags</Label>
              <Input
                id="tags"
                name="tags"
                type="text"
                placeholder="thriller, family-friendly, regional content, high-budget, web-series"
                className="w-full"
              />
              <p className="text-sm text-muted-foreground">
                Comma-separated tags for easy categorization and search (optional)
              </p>
            </div>

            {/* Source */}
            <div className="space-y-2">
              <Label htmlFor="source">Source</Label>
              <Input
                id="source"
                name="source"
                type="text"
                placeholder="e.g., Industry contact, trade publication, festival meeting"
                className="w-full"
              />
              <p className="text-sm text-muted-foreground">
                How you obtained this intelligence (optional)
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-4">
              <Button type="submit" className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Create Mandate
              </Button>
              <Link href="/founder/dashboard">
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Helper Information */}
      <div className="mt-8 p-6 bg-muted/50 rounded-lg">
        <h3 className="font-semibold mb-2">Tips for Effective Mandates</h3>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li>• Be specific about content genres, formats, and budget ranges</li>
          <li>• Include information about target demographics and regional preferences</li>
          <li>• Note any recent successful acquisitions or upcoming slate gaps</li>
          <li>• Update mandates regularly as platform needs evolve</li>
          <li>• Use consistent tagging to make searching and filtering easier</li>
        </ul>
      </div>
    </div>
  )
}