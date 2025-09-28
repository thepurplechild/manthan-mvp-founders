"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import IndiaProjectFields from "./IndiaProjectFields";

interface CreateProjectFormProps {
  createProject: (formData: FormData) => Promise<void>;
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <div className="pt-4">
      <Button
        type="submit"
        disabled={pending}
        className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold py-3 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {pending ? (
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Creating Project...
          </div>
        ) : (
          "Create Project"
        )}
      </Button>
    </div>
  );
}

export function CreateProjectForm({ createProject }: CreateProjectFormProps) {
  return (
    <form action={createProject} className="space-y-6">
      {/* Title */}
      <div className="space-y-2">
        <Label htmlFor="title" className="text-white">
          Project Title *
        </Label>
        <Input
          id="title"
          name="title"
          type="text"
          required
          placeholder="Enter your project title"
          className="bg-white/5 border-white/20 text-white placeholder-purple-300"
        />
      </div>

      {/* Logline */}
      <div className="space-y-2">
        <Label htmlFor="logline" className="text-white">
          Logline
        </Label>
        <Input
          id="logline"
          name="logline"
          type="text"
          placeholder="A compelling one-sentence summary of your story"
          className="bg-white/5 border-white/20 text-white placeholder-purple-300"
        />
        <p className="text-sm text-purple-300">
          A concise, engaging summary that captures the essence of your story
        </p>
      </div>

      {/* Synopsis */}
      <div className="space-y-2">
        <Label htmlFor="synopsis" className="text-white">
          Synopsis
        </Label>
        <Textarea
          id="synopsis"
          name="synopsis"
          rows={4}
          placeholder="Provide a detailed summary of your story, including main characters, plot, and themes"
          className="bg-white/5 border-white/20 text-white placeholder-purple-300"
        />
        <p className="text-sm text-purple-300">
          A more detailed overview of your story (optional but recommended)
        </p>
      </div>

      {/* India-specific fields */}
      <IndiaProjectFields />

      {/* Submit Button with Loading State */}
      <SubmitButton />
    </form>
  );
}