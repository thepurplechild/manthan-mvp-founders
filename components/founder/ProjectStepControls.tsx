"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type ActionResult = {
  status: "idle" | "success" | "error";
  message?: string;
};

const INITIAL_STATE: ActionResult = { status: "idle" };

interface StepActionButtonProps {
  action: (state: ActionResult, formData: FormData) => Promise<ActionResult>;
  projectId: string;
  stepName: string;
  label: string;
  pendingLabel?: string;
  variant?: "default" | "outline" | "secondary" | "destructive";
  size?: "sm" | "default" | "lg";
  className?: string;
  showMessage?: boolean;
}

export function StepActionButton({
  action,
  projectId,
  stepName,
  label,
  pendingLabel = "Working…",
  variant = "default",
  size = "sm",
  className,
  showMessage = false,
}: StepActionButtonProps) {
  const [state, formAction] = useFormState(action, INITIAL_STATE);

  return (
    <form action={formAction} className={cn("space-y-2", className)}>
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="stepName" value={stepName} />
      <SubmitButton label={label} pendingLabel={pendingLabel} variant={variant} size={size} />
      {state.status === "error" ? (
        <p className="text-xs text-destructive">{state.message ?? "Unable to run step."}</p>
      ) : null}
      {state.status === "success" && showMessage ? (
        <p className="text-xs text-green-600">{state.message ?? "Step triggered."}</p>
      ) : null}
    </form>
  );
}

interface SubmitButtonProps {
  label: string;
  pendingLabel: string;
  variant: "default" | "outline" | "secondary" | "destructive";
  size: "sm" | "default" | "lg";
}

function SubmitButton({ label, pendingLabel, variant, size }: SubmitButtonProps) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} size={size} disabled={pending}>
      {pending ? (
        <span className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          {pendingLabel}
        </span>
      ) : (
        label
      )}
    </Button>
  );
}

interface MandatesFormProps {
  action: (state: ActionResult, formData: FormData) => Promise<ActionResult>;
  projectId: string;
  initialValue?: string;
  label?: string;
  helperText?: string;
}

export function MandatesForm({
  action,
  projectId,
  initialValue = "",
  label = "Platform mandates & special instructions",
  helperText = "Document platform notes, deal constraints, or human-in-the-loop instructions for this project.",
}: MandatesFormProps) {
  const [state, formAction] = useFormState(action, INITIAL_STATE);
  const [lastSuccess, setLastSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (state.status === "success") {
      setLastSuccess(state.message ?? "Saved");
      const timeout = setTimeout(() => setLastSuccess(null), 4000);
      return () => clearTimeout(timeout);
    }
    return undefined;
  }, [state]);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="projectId" value={projectId} />
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">{label}</label>
        <Textarea
          name="mandates"
          defaultValue={initialValue}
          minLength={0}
          rows={6}
          placeholder="Add platform mandates, special handling notes, or escalation instructions."
        />
        <p className="text-xs text-muted-foreground">{helperText}</p>
      </div>
      <div className="flex items-center gap-3">
        <MandatesSubmitButton />
        {state.status === "error" ? (
          <span className="text-xs text-destructive">{state.message ?? "Unable to save."}</span>
        ) : null}
        {lastSuccess ? (
          <span className="text-xs text-green-600">{lastSuccess}</span>
        ) : null}
      </div>
    </form>
  );
}

function MandatesSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? (
        <span className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Saving…
        </span>
      ) : (
        "Save"
      )}
    </Button>
  );
}
