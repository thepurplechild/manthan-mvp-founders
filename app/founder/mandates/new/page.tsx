import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ArrowLeft, Brain } from "lucide-react";

export default async function NewMandatePage() {
  const supabase = await createClient();
  
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    redirect("/auth/login");
  }

  // Verify founder role
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "founder") {
    redirect("/dashboard");
  }

  const createMandate = async (formData: FormData) => {
    "use server";
    
    const platformName = formData.get("platform_name") as string;
    const mandateDescription = formData.get("mandate_description") as string;
    const tags = formData.get("tags") as string;
    const source = formData.get("source") as string;
    
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      redirect("/auth/login");
      return;
    }

    const { error } = await supabase
      .from("platform_mandates")
      .insert({
        platform_name: platformName,
        mandate_description: mandateDescription,
        tags: tags ? tags.split(',').map(t => t.trim()) : [],
        source: source || null,
        created_by: user.id
      });

    if (error) {
      console.error("Error creating mandate:", error);
      redirect("/founder/mandates/new?error=Failed to create mandate");
      return;
    }

    redirect("/founder/dashboard?tab=mandates");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Navigation */}
      <nav className="border-b border-white/10 bg-black/20">
        <div className="container mx-auto px-6 py-4">
          <Link 
            href="/founder/dashboard" 
            className="inline-flex items-center gap-2 text-purple-200 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Command Center
          </Link>
        </div>
      </nav>

      <div className="container mx-auto px-6 py-12 max-w-2xl">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <Brain className="w-8 h-8 text-purple-400" />
            <h1 className="text-4xl font-bold text-white">Add Market Intelligence</h1>
          </div>
          <p className="text-purple-200 text-lg">
            Log platform mandates, buyer preferences, and market insights to build your competitive advantage.
          </p>
        </div>

        <Card className="bg-white/10 backdrop-blur-lg border-white/20">
          <CardHeader>
            <CardTitle className="text-white">Platform Mandate Details</CardTitle>
            <CardDescription className="text-purple-200">
              Record specific requirements and preferences from platforms and buyers
            </CardDescription>
          </CardHeader>
          
          <CardContent>
            <form action={createMandate} className="space-y-6">
              {/* Platform Name */}
              <div className="space-y-2">
                <Label htmlFor="platform_name" className="text-white">
                  Platform/Buyer Name *
                </Label>
                <Input
                  id="platform_name"
                  name="platform_name"
                  type="text"
                  required
                  placeholder="Netflix India, Amazon Prime, SonyLIV, etc."
                  className="bg-white/5 border-white/20 text-white placeholder-purple-300"
                />
              </div>

              {/* Mandate Description */}
              <div className="space-y-2">
                <Label htmlFor="mandate_description" className="text-white">
                  Mandate/Requirement Description *
                </Label>
                <Textarea
                  id="mandate_description"
                  name="mandate_description"
                  rows={4}
                  required
                  placeholder="Describe what the platform is looking for - genre preferences, themes, specific requirements, budget ranges, etc."
                  className="bg-white/5 border-white/20 text-white placeholder-purple-300"
                />
                <p className="text-sm text-purple-300">
                  Be specific about what the platform/buyer mentioned they need
                </p>
              </div>

              {/* Tags */}
              <div className="space-y-2">
                <Label htmlFor="tags" className="text-white">
                  Tags
                </Label>
                <Input
                  id="tags"
                  name="tags"
                  type="text"
                  placeholder="thriller, female-led, tamil, regional, high-stakes, etc. (comma-separated)"
                  className="bg-white/5 border-white/20 text-white placeholder-purple-300"
                />
                <p className="text-sm text-purple-300">
                  Add searchable tags to help match projects to mandates
                </p>
              </div>

              {/* Source */}
              <div className="space-y-2">
                <Label htmlFor="source" className="text-white">
                  Source/Context
                </Label>
                <Input
                  id="source"
                  name="source"
                  type="text"
                  placeholder="Conversation with [Executive Name], Industry Event, Email, etc."
                  className="bg-white/5 border-white/20 text-white placeholder-purple-300"
                />
                <p className="text-sm text-purple-300">
                  How did you obtain this information?
                </p>
              </div>

              {/* Submit Button */}
              <div className="pt-4">
                <Button
                  type="submit"
                  className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold py-3"
                >
                  <Brain className="w-4 h-4 mr-2" />
                  Add Market Intelligence
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <div className="mt-8 bg-blue-600/20 border border-blue-500/30 rounded-lg p-6">
          <h3 className="text-white font-semibold mb-2 flex items-center gap-2">
            <Brain className="w-5 h-5 text-blue-400" />
            Pro Tip: Building Your Data Advantage
          </h3>
          <p className="text-blue-200 text-sm">
            This intelligence will power future AI matching algorithms. The more specific and detailed your mandates, 
            the better the platform can match projects to buyer needs and predict success rates.
          </p>
        </div>
      </div>
    </div>
  );
}