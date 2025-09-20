'use client';

import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { DealEntrySchema, type DealEntryInput, DealStatusEnum } from '@/lib/zod/deal';

export type DealPipelineFormState = {
  ok: boolean;
  error: string | null;
};

interface DealPipelineFormProps {
  action: (prevState: DealPipelineFormState, formData: FormData) => Promise<DealPipelineFormState>;
  projectId: string;
  onResult: (result: DealPipelineFormState) => void;
}

const STATUS_OPTIONS = DealStatusEnum.options;

export default function DealPipelineForm({ action, projectId, onResult }: DealPipelineFormProps): JSX.Element {
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<DealEntryInput>({
    resolver: zodResolver(DealEntrySchema),
    defaultValues: {
      status: 'introduced',
      feedback_notes: '',
    },
  });

  const [serverState, setServerState] = useState<DealPipelineFormState>({ ok: false, error: null });
  const [isPending, startTransition] = useTransition();

  const onSubmit = handleSubmit((values) => {
    const formData = new FormData();
    formData.append('project_id', projectId);
    formData.append('target_buyer_name', values.target_buyer_name);
    formData.append('status', values.status);
    if (values.feedback_notes) {
      formData.append('feedback_notes', values.feedback_notes);
    }

    startTransition(async () => {
      const result = await action(serverState, formData);
      setServerState(result);
      onResult(result);
      if (result.ok) {
        reset({ status: 'introduced', feedback_notes: '', target_buyer_name: '' });
      }
    });
  });

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-5 shadow-sm">
      <h3 className="text-base font-medium">Log new outreach</h3>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="target_buyer_name">
            Target buyer name
          </label>
          <input
            id="target_buyer_name"
            type="text"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            placeholder="e.g. Netflix India Originals Team"
            {...register('target_buyer_name')}
          />
          {errors.target_buyer_name ? (
            <p className="text-xs text-rose-600">{errors.target_buyer_name.message}</p>
          ) : null}
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="status">
            Status
          </label>
          <select
            id="status"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            {...register('status')}
          >
            {STATUS_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {value.replace('_', ' ')}
              </option>
            ))}
          </select>
          {errors.status ? <p className="text-xs text-rose-600">{errors.status.message}</p> : null}
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="feedback_notes">
            Feedback notes (optional)
          </label>
          <textarea
            id="feedback_notes"
            rows={3}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            placeholder="Key notes or follow-up details"
            {...register('feedback_notes')}
          />
          {errors.feedback_notes ? <p className="text-xs text-rose-600">{errors.feedback_notes.message}</p> : null}
        </div>
        {serverState.error ? (
          <p className="text-sm text-rose-600">{serverState.error}</p>
        ) : null}
        <button
          type="submit"
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isPending}
        >
          {isPending ? 'Saving…' : 'Add entry'}
        </button>
      </form>
    </div>
  );
}
