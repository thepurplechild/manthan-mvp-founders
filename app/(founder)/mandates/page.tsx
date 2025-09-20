'use client';

import { useCallback, useMemo, useState } from 'react';

import MandateForm from '@/components/mandates/MandateForm';
import MandatesTable from '@/components/mandates/MandatesTable';
import type { MandateRecord } from '@/lib/mandates/api';

interface FeedbackState {
  type: 'success' | 'error';
  message: string;
}

export default function MandatesPage(): JSX.Element {
  const [refreshToken, setRefreshToken] = useState(0);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);

  const dismiss = () => setFeedback(null);

  const notify = useMemo(
    () => ({
      onSuccess: (message: string) => setFeedback({ type: 'success', message }),
      onError: (message: string) => setFeedback({ type: 'error', message }),
    }),
    []
  );

  const handleCreated = useCallback(
    (mandate: MandateRecord) => {
      notify.onSuccess(`Mandate “${mandate.title}” created.`);
      setRefreshToken((token) => token + 1);
    },
    [notify]
  );

  const handleUpdated = useCallback(
    (message: string) => {
      notify.onSuccess(message);
      setRefreshToken((token) => token + 1);
    },
    [notify]
  );

  const handleError = useCallback(
    (error: string) => {
      notify.onError(error);
    },
    [notify]
  );

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Platform Mandates</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage buyer mandates used across packaging workflows. This area is restricted to founder accounts.
        </p>
      </div>

      {feedback ? (
        <div
          role="status"
          className={`rounded-md border px-4 py-3 text-sm ${
            feedback.type === 'success'
              ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-900'
              : 'border-red-500/20 bg-red-500/10 text-red-900'
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <span>{feedback.message}</span>
            <button
              type="button"
              onClick={dismiss}
              className="text-xs font-medium uppercase tracking-wide text-current"
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[360px,1fr]">
        <MandateForm onCreated={handleCreated} onError={handleError} />
        <MandatesTable
          refreshToken={refreshToken}
          onUpdated={handleUpdated}
          onError={handleError}
        />
      </div>
    </div>
  );
}
