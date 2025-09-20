'use client';

import { useEffect, useState } from 'react';

import { updateDealFeedback } from '@/lib/projects/deal-api';
import type { FeedbackInput } from '@/lib/projects/deal-schema';

interface FeedbackEditorProps {
  projectId: string;
  initialValue: string | null;
  onSaved: (value: string | null) => void;
  onError: (message: string) => void;
}

export default function FeedbackEditor({ projectId, initialValue, onSaved, onError }: FeedbackEditorProps): JSX.Element {
  const [value, setValue] = useState(initialValue ?? '');
  const [pending, setPending] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    setValue(initialValue ?? '');
  }, [initialValue]);

  const handleSave = async () => {
    try {
      setPending(true);
      const payload: FeedbackInput = { feedback: value };
      const result = await updateDealFeedback(projectId, payload);
      onSaved(result.feedback ?? null);
      setSavedAt(new Date().toLocaleTimeString());
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save feedback.';
      onError(message);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-2 rounded-xl border border-border bg-card p-4 shadow-sm">
      <label htmlFor="deal-feedback" className="text-sm font-medium">
        Buyer feedback
      </label>
      <textarea
        id="deal-feedback"
        rows={4}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        maxLength={1000}
        disabled={pending}
        placeholder="Notes or feedback received from the buyer"
      />
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{value.length}/1000</span>
        {savedAt ? <span>Saved at {savedAt}</span> : null}
      </div>
      <button
        type="button"
        onClick={handleSave}
        disabled={pending}
        className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? 'Saving…' : 'Save feedback'}
      </button>
    </div>
  );
}
