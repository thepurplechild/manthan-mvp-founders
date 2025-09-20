'use client';

import { useFormState } from 'react-dom';
import { useEffect, useRef } from 'react';

export type MandateFormState = {
  ok: boolean;
  error: string | null;
};

const initialState: MandateFormState = { ok: false, error: null };

interface MandateFormProps {
  action: (prevState: MandateFormState, formData: FormData) => Promise<MandateFormState>;
}

export default function MandateForm({ action }: MandateFormProps): JSX.Element {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useFormState(action, initialState);

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
    }
  }, [state.ok]);

  return (
    <form ref={formRef} action={formAction} className="space-y-4 rounded-lg border border-border bg-card p-6 shadow-sm">
      <div>
        <h2 className="text-lg font-medium">Add platform mandate</h2>
        <p className="text-sm text-muted-foreground">
          Capture new market mandates to keep the founder dashboards current.
        </p>
      </div>

      {state.ok ? (
        <div className="rounded-md border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm text-emerald-900">
          Mandate created successfully.
        </div>
      ) : null}
      {state.error ? (
        <div className="rounded-md border border-rose-300 bg-rose-50 px-4 py-2 text-sm text-rose-900">
          {state.error}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="platform_name">
            Platform name
          </label>
          <input
            id="platform_name"
            name="platform_name"
            required
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            placeholder="Netflix India"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="source">
            Source (optional)
          </label>
          <input
            id="source"
            name="source"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            placeholder="Market intel brief"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="mandate_description">
          Mandate description
        </label>
        <textarea
          id="mandate_description"
          name="mandate_description"
          required
          rows={4}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          placeholder="Summarise the mandate requirements"
        />
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="tags">
          Tags (comma separated)
        </label>
        <input
          id="tags"
          name="tags"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          placeholder="family drama, originals"
        />
      </div>

      <button
        type="submit"
        className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
      >
        Create mandate
      </button>
    </form>
  );
}
