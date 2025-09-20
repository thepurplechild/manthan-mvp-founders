'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import DealPipelineForm, { type DealPipelineFormState } from './DealPipelineForm';
import DealPipelineTable, { type DealPipelineEntry } from './DealPipelineTable';

interface DealPipelineSectionProps {
  projectId: string;
  entries: DealPipelineEntry[];
  createEntryAction: (prevState: DealPipelineFormState, formData: FormData) => Promise<DealPipelineFormState>;
}

export default function DealPipelineSection({
  projectId,
  entries,
  createEntryAction,
}: DealPipelineSectionProps): JSX.Element {
  const router = useRouter();
  const [feedback, setFeedback] = useState<DealPipelineFormState | null>(null);

  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold">Deal pipeline</h2>
        <p className="text-sm text-muted-foreground">
          Track outreach activity and deal status for this project. Entries are visible to founders only.
        </p>
      </header>

      {feedback?.ok ? (
        <div className="rounded-md border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm text-emerald-900">
          Deal entry created successfully.
        </div>
      ) : null}
      {feedback?.error ? (
        <div className="rounded-md border border-rose-300 bg-rose-50 px-4 py-2 text-sm text-rose-900">
          {feedback.error}
        </div>
      ) : null}

      <DealPipelineForm
        action={createEntryAction}
        projectId={projectId}
        onResult={(result) => {
          setFeedback(result);
          if (result.ok) {
            router.refresh();
          }
        }}
      />

      <DealPipelineTable entries={entries} />
    </section>
  );
}
