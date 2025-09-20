'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { createOutreach } from '@/lib/projects/deal-api';
import { OutreachInputSchema, type OutreachInput, OutreachChannelSchema } from '@/lib/projects/deal-schema';

interface OutreachFormProps {
  projectId: string;
  onCreated: (record: Awaited<ReturnType<typeof createOutreach>>) => void;
  onError: (message: string) => void;
}

const CHANNEL_OPTIONS = OutreachChannelSchema.options.map((value) => ({
  value,
  label: value === 'dm' ? 'Direct Message' : value.charAt(0).toUpperCase() + value.slice(1),
}));

export default function OutreachForm({ projectId, onCreated, onError }: OutreachFormProps): JSX.Element {
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<OutreachInput>({
    resolver: zodResolver(OutreachInputSchema),
    defaultValues: {
      channel: 'email',
      contact: '',
      note: '',
      next_follow_up_at: undefined,
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      setSubmitting(true);
      const record = await createOutreach(projectId, values);
      reset({ channel: values.channel, contact: '', note: '', next_follow_up_at: undefined });
      onCreated(record);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to log outreach.';
      onError(message);
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-border bg-card p-4 shadow-sm">
      <header>
        <h3 className="text-base font-medium">Log outreach</h3>
        <p className="text-sm text-muted-foreground">Record contact attempts to keep the deal pipeline current.</p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="channel" className="text-sm font-medium">
            Channel
          </label>
          <select
            id="channel"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            disabled={submitting}
            {...register('channel')}
          >
            {CHANNEL_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {errors.channel ? <p className="text-sm text-red-600">{errors.channel.message}</p> : null}
        </div>

        <div className="space-y-1">
          <label htmlFor="contact" className="text-sm font-medium">
            Contact (optional)
          </label>
          <input
            id="contact"
            type="text"
            placeholder="Name or email"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            disabled={submitting}
            {...register('contact')}
          />
          {errors.contact ? <p className="text-sm text-red-600">{errors.contact.message}</p> : null}
        </div>
      </div>

      <div className="space-y-1">
        <label htmlFor="note" className="text-sm font-medium">
          Note
        </label>
        <textarea
          id="note"
          rows={3}
          placeholder="What happened during outreach?"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          disabled={submitting}
          {...register('note')}
        />
        {errors.note ? <p className="text-sm text-red-600">{errors.note.message}</p> : null}
      </div>

      <div className="space-y-1">
        <label htmlFor="next_follow_up_at" className="text-sm font-medium">
          Next follow-up (optional)
        </label>
        <input
          id="next_follow_up_at"
          type="datetime-local"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          disabled={submitting}
          {...register('next_follow_up_at')}
        />
        <p className="text-xs text-muted-foreground">Helps remind the team when to reach out again.</p>
      </div>

      <button
        type="submit"
        className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
        disabled={submitting}
      >
        {submitting ? 'Saving…' : 'Log outreach'}
      </button>
    </form>
  );
}
