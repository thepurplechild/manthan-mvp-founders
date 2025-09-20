'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { createMandate, type MandateRecord } from '@/lib/mandates/api';
import { MandateInputSchema, type MandateInput } from '@/lib/mandates/schema';

interface MandateFormProps {
  onCreated: (mandate: MandateRecord) => void;
  onError: (message: string) => void;
}

export default function MandateForm({ onCreated, onError }: MandateFormProps): JSX.Element {
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<MandateInput>({
    resolver: zodResolver(MandateInputSchema),
    defaultValues: {
      code: '',
      title: '',
      description: '',
      is_active: true,
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      setSubmitting(true);
      const created = await createMandate(values);
      reset({ code: '', title: '', description: '', is_active: true });
      onCreated(created);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to create mandate.';
      onError(message);
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <header className="mb-4">
        <h2 className="text-lg font-medium">Create mandate</h2>
        <p className="text-sm text-muted-foreground">
          Add a new platform mandate. Codes must be unique and descriptive.
        </p>
      </header>

      <form className="space-y-4" onSubmit={onSubmit}>
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="code">
            Code
          </label>
          <input
            id="code"
            type="text"
            autoComplete="off"
            placeholder="e.g. NETFLIX_FAMILY"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            {...register('code')}
            disabled={submitting}
          />
          {errors.code ? (
            <p className="text-sm text-red-600" role="alert">
              {errors.code.message}
            </p>
          ) : null}
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="title">
            Title
          </label>
          <input
            id="title"
            type="text"
            placeholder="Platform expectations"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            {...register('title')}
            disabled={submitting}
          />
          {errors.title ? (
            <p className="text-sm text-red-600" role="alert">
              {errors.title.message}
            </p>
          ) : null}
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="description">
            Description
          </label>
          <textarea
            id="description"
            rows={4}
            placeholder="Detailed mandate requirements..."
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            {...register('description')}
            disabled={submitting}
          />
          {errors.description ? (
            <p className="text-sm text-red-600" role="alert">
              {errors.description.message}
            </p>
          ) : null}
        </div>

        <label className="flex items-center gap-2 text-sm font-medium" htmlFor="is_active">
          <input
            id="is_active"
            type="checkbox"
            className="h-4 w-4 rounded border-border"
            {...register('is_active')}
            disabled={submitting}
            defaultChecked
          />
          Active
        </label>

        <button
          type="submit"
          className="inline-flex w-full items-center justify-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={submitting}
        >
          {submitting ? 'Creating…' : 'Create mandate'}
        </button>
      </form>
    </section>
  );
}
