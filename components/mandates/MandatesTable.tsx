'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import {
  deleteMandate,
  listMandates,
  updateMandate,
  type MandateRecord,
} from '@/lib/mandates/api';
import {
  MANDATES_PAGE_SIZE,
  MandateInputSchema,
  type MandateInput,
} from '@/lib/mandates/schema';

interface MandatesTableProps {
  refreshToken: number;
  onUpdated: (message: string) => void;
  onError: (message: string) => void;
}

export default function MandatesTable({ refreshToken, onUpdated, onError }: MandatesTableProps): JSX.Element {
  const [mandates, setMandates] = useState<MandateRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    async function fetchMandates() {
      setLoading(true);
      setError(null);
      try {
        const offset = page * MANDATES_PAGE_SIZE;
        const { data, count } = await listMandates({
          search: debouncedSearch,
          limit: MANDATES_PAGE_SIZE,
          offset,
          signal: controller.signal,
        });

        if (!active) return;

        if (count > 0 && offset >= count) {
          setPage(Math.max(0, Math.ceil(count / MANDATES_PAGE_SIZE) - 1));
          return;
        }

        setMandates(data);
        setTotal(count);
      } catch (err) {
        if (!active) return;
        const message = err instanceof Error ? err.message : 'Unable to load mandates.';
        setError(message);
        onError(message);
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchMandates();

    return () => {
      active = false;
      controller.abort();
    };
  }, [debouncedSearch, page, refreshToken, onError]);

  const handleRowUpdate = useCallback(
    (updated: MandateRecord, message: string) => {
      setMandates((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      onUpdated(message);
    },
    [onUpdated]
  );

  const handleRowDelete = useCallback(
    (id: string) => {
      setMandates((prev) => prev.filter((item) => item.id !== id));
      setTotal((prev) => Math.max(0, prev - 1));
      onUpdated('Mandate deleted.');
    },
    [onUpdated]
  );

  const totalPages = useMemo(() => Math.ceil(total / MANDATES_PAGE_SIZE) || 1, [total]);

  return (
    <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-medium">Mandates</h2>
          <p className="text-sm text-muted-foreground">Search, edit, or remove platform mandates.</p>
        </div>
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search code or title"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm sm:w-64"
          aria-label="Search mandates"
        />
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="min-w-full divide-y divide-border text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th scope="col" className="px-4 py-2 text-left font-medium text-muted-foreground">Code</th>
              <th scope="col" className="px-4 py-2 text-left font-medium text-muted-foreground">Title</th>
              <th scope="col" className="px-4 py-2 text-left font-medium text-muted-foreground">Description</th>
              <th scope="col" className="px-4 py-2 text-left font-medium text-muted-foreground">Active</th>
              <th scope="col" className="px-4 py-2 text-left font-medium text-muted-foreground">Created</th>
              <th scope="col" className="px-4 py-2 text-right font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-muted-foreground">
                  Loading mandates…
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-red-600">
                  {error}
                </td>
              </tr>
            ) : mandates.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-muted-foreground">
                  No mandates found.
                </td>
              </tr>
            ) : (
              mandates.map((mandate) => (
                <MandateRow
                  key={mandate.id}
                  mandate={mandate}
                  onRowUpdated={handleRowUpdate}
                  onRowDeleted={handleRowDelete}
                  onError={onError}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      <footer className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-xs text-muted-foreground">
          Showing {mandates.length} of {total} mandates
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPage((prev) => Math.max(0, prev - 1))}
            disabled={page === 0 || loading}
            className="rounded-md border border-border px-3 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-xs text-muted-foreground">
            Page {total === 0 ? 0 : page + 1} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((prev) => (prev + 1 < totalPages ? prev + 1 : prev))}
            disabled={page + 1 >= totalPages || loading}
            className="rounded-md border border-border px-3 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </footer>
    </section>
  );
}

interface MandateRowProps {
  mandate: MandateRecord;
  onRowUpdated: (mandate: MandateRecord, message: string) => void;
  onRowDeleted: (id: string) => void;
  onError: (message: string) => void;
}

function MandateRow({ mandate, onRowUpdated, onRowDeleted, onError }: MandateRowProps): JSX.Element {
  const [optimistic, setOptimistic] = useState<MandateRecord>(mandate);
  const [isEditing, setIsEditing] = useState(false);
  const [savingToggle, setSavingToggle] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const form = useForm<MandateInput>({
    resolver: zodResolver(MandateInputSchema),
    defaultValues: {
      code: mandate.code,
      title: mandate.title,
      description: mandate.description ?? '',
      is_active: mandate.is_active,
    },
  });

  useEffect(() => {
    setOptimistic(mandate);
    form.reset({
      code: mandate.code,
      title: mandate.title,
      description: mandate.description ?? '',
      is_active: mandate.is_active,
    });
  }, [mandate, form]);

  const commitToggle = async (value: boolean) => {
    const original = optimistic.is_active;
    setSavingToggle(true);
    setOptimistic((prev) => ({ ...prev, is_active: value }));
    try {
      const updated = await updateMandate(mandate.id, { is_active: value });
      setOptimistic(updated);
      onRowUpdated(updated, `Mandate “${updated.title}” updated.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update mandate.';
      setOptimistic((prev) => ({ ...prev, is_active: original }));
      onError(message);
    } finally {
      setSavingToggle(false);
    }
  };

  const submitEdit = form.handleSubmit(async (values) => {
    try {
      setSavingEdit(true);
      const updated = await updateMandate(mandate.id, values);
      setOptimistic(updated);
      onRowUpdated(updated, `Mandate “${updated.title}” updated.`);
      setIsEditing(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update mandate.';
      onError(message);
    } finally {
      setSavingEdit(false);
    }
  });

  const handleDelete = async () => {
    const confirmed = window.confirm(`Delete mandate “${mandate.title}”? This action cannot be undone.`);
    if (!confirmed) return;

    try {
      setDeleting(true);
      await deleteMandate(mandate.id);
      onRowDeleted(mandate.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete mandate.';
      onError(message);
    } finally {
      setDeleting(false);
    }
  };

  if (isEditing) {
    return (
      <tr className="bg-muted/30">
        <td colSpan={6} className="px-4 py-3">
          <form className="grid gap-3 md:grid-cols-[repeat(2,minmax(0,1fr))]" onSubmit={submitEdit}>
            <div className="flex flex-col gap-1">
              <label htmlFor={`code-${mandate.id}`} className="text-xs font-medium uppercase text-muted-foreground">
                Code
              </label>
              <input
                id={`code-${mandate.id}`}
                type="text"
                className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                {...form.register('code')}
                disabled={savingEdit}
              />
              {form.formState.errors.code ? (
                <p className="text-xs text-red-600">{form.formState.errors.code.message}</p>
              ) : null}
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor={`title-${mandate.id}`} className="text-xs font-medium uppercase text-muted-foreground">
                Title
              </label>
              <input
                id={`title-${mandate.id}`}
                type="text"
                className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                {...form.register('title')}
                disabled={savingEdit}
              />
              {form.formState.errors.title ? (
                <p className="text-xs text-red-600">{form.formState.errors.title.message}</p>
              ) : null}
            </div>

            <div className="md:col-span-2 flex flex-col gap-1">
              <label
                htmlFor={`description-${mandate.id}`}
                className="text-xs font-medium uppercase text-muted-foreground"
              >
                Description
              </label>
              <textarea
                id={`description-${mandate.id}`}
                rows={3}
                className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                {...form.register('description')}
                disabled={savingEdit}
              />
              {form.formState.errors.description ? (
                <p className="text-xs text-red-600">{form.formState.errors.description.message}</p>
              ) : null}
            </div>

            <div className="md:col-span-2 flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm font-medium" htmlFor={`is_active-${mandate.id}`}>
                <input
                  id={`is_active-${mandate.id}`}
                  type="checkbox"
                  className="h-4 w-4"
                  {...form.register('is_active')}
                  disabled={savingEdit}
                />
                Active
              </label>
              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditing(false);
                    form.reset({
                      code: mandate.code,
                      title: mandate.title,
                      description: mandate.description ?? '',
                      is_active: mandate.is_active,
                    });
                  }}
                  className="rounded-md border border-border px-3 py-1 text-xs font-medium"
                  disabled={savingEdit}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                  disabled={savingEdit}
                >
                  {savingEdit ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </div>
          </form>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td className="px-4 py-3 font-mono text-xs uppercase tracking-wide text-muted-foreground">{optimistic.code}</td>
      <td className="px-4 py-3 font-medium">{optimistic.title}</td>
      <td className="px-4 py-3 text-sm text-muted-foreground">
        <span title={optimistic.description ?? ''} className="block max-w-xs truncate">
          {optimistic.description || '—'}
        </span>
      </td>
      <td className="px-4 py-3">
        <label className="inline-flex items-center gap-2 text-xs font-medium">
          <input
            type="checkbox"
            checked={optimistic.is_active}
            onChange={(event) => commitToggle(event.target.checked)}
            disabled={savingToggle || deleting}
            className="h-4 w-4"
            aria-label={`Toggle mandate ${optimistic.title}`}
          />
          {savingToggle ? 'Updating…' : optimistic.is_active ? 'Active' : 'Inactive'}
        </label>
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground">
        {new Date(optimistic.created_at).toLocaleDateString()}
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="rounded-md border border-border px-3 py-1 text-xs font-medium"
            disabled={savingToggle || deleting}
          >
            Edit
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="rounded-md border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-700 disabled:opacity-60"
            disabled={deleting || savingToggle}
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </td>
    </tr>
  );
}
