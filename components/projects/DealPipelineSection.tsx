'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import FeedbackEditor from '@/components/projects/FeedbackEditor';
import OutreachForm from '@/components/projects/OutreachForm';
import StatusSelect from '@/components/projects/StatusSelect';
import {
  getDealMeta,
  listOutreach,
  updateDealStatus,
  type DealMetaRecord,
  type OutreachRecord,
} from '@/lib/projects/deal-api';
import { DealStatusSchema, OUTREACH_PAGE_SIZE, type DealStatus } from '@/lib/projects/deal-schema';

interface DealPipelineSectionProps {
  projectId: string;
}

interface BannerState {
  type: 'success' | 'error';
  message: string;
}

const STATUS_BADGES: Record<DealStatus, string> = {
  lead: 'bg-gray-100 text-gray-700 border border-gray-200',
  contacted: 'bg-blue-100 text-blue-700 border border-blue-200',
  qualified: 'bg-indigo-100 text-indigo-700 border border-indigo-200',
  proposal: 'bg-amber-100 text-amber-800 border border-amber-200',
  negotiation: 'bg-orange-100 text-orange-700 border border-orange-200',
  won: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
  lost: 'bg-rose-100 text-rose-700 border border-rose-200',
};

export default function DealPipelineSection({ projectId }: DealPipelineSectionProps): JSX.Element {
  const [meta, setMeta] = useState<DealMetaRecord | null>(null);
  const [metaLoading, setMetaLoading] = useState(true);
  const [outreach, setOutreach] = useState<OutreachRecord[]>([]);
  const [outreachCount, setOutreachCount] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [logsLoading, setLogsLoading] = useState(true);
  const [refreshIndex, setRefreshIndex] = useState(0);
  const [banner, setBanner] = useState<BannerState | null>(null);

  useEffect(() => {
    let ignore = false;
    getDealMeta(projectId)
      .then((record) => {
        if (!ignore) {
          setMeta(record);
        }
      })
      .catch((error) => {
        console.error('[deal-pipeline] failed to load meta', error);
        if (!ignore) {
          setBanner({ type: 'error', message: 'Unable to load deal information.' });
        }
      })
      .finally(() => {
        if (!ignore) setMetaLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [projectId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(0);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLogsLoading(true);
    listOutreach(projectId, {
      limit: OUTREACH_PAGE_SIZE,
      offset: page * OUTREACH_PAGE_SIZE,
      search: debouncedSearch,
      signal: controller.signal,
    })
      .then(({ data, count }) => {
        if (!active) return;
        setOutreach(data);
        setOutreachCount(count);
        if (count > 0 && page * OUTREACH_PAGE_SIZE >= count) {
          setPage(Math.max(0, Math.ceil(count / OUTREACH_PAGE_SIZE) - 1));
        }
      })
      .catch((error) => {
        if (!active) return;
        console.error('[deal-pipeline] failed to load outreach', error);
        setBanner({ type: 'error', message: 'Unable to load outreach history.' });
      })
      .finally(() => {
        if (active) setLogsLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [projectId, page, debouncedSearch, refreshIndex]);

  const handleStatusChange = useCallback(
    async (status: DealStatus) => {
      if (!meta) return;
      const previous = meta.status;
      setMeta({ ...meta, status });
      try {
        const result = await updateDealStatus(projectId, status);
        setMeta(result);
        setBanner({ type: 'success', message: `Status updated to ${statusLabel(status)}.` });
      } catch (error) {
        console.error('[deal-pipeline] failed to update status', error);
        setMeta({ ...meta, status: previous });
        setBanner({ type: 'error', message: 'Failed to update status.' });
      }
    },
    [meta, projectId]
  );

  const handleFeedbackSaved = useCallback((value: string | null) => {
    setMeta((prev) => (prev ? { ...prev, feedback: value ?? null, updated_at: new Date().toISOString() } : prev));
    setBanner({ type: 'success', message: 'Feedback saved.' });
  }, []);

  const handleError = useCallback((message: string) => {
    setBanner({ type: 'error', message });
  }, []);

  const handleOutreachCreated = useCallback((record: OutreachRecord) => {
    setBanner({ type: 'success', message: 'Outreach logged.' });
    setSearch('');
    setPage(0);
    setRefreshIndex((value) => value + 1);
    setOutreach((prev) => [record, ...prev].slice(0, OUTREACH_PAGE_SIZE));
    setOutreachCount((prev) => prev + 1);
  }, []);

  const status = meta?.status ?? DealStatusSchema.parse('lead');

  const totalPages = useMemo(() => Math.max(1, Math.ceil(outreachCount / OUTREACH_PAGE_SIZE)), [outreachCount]);

  return (
    <section className="mt-10 space-y-6">
      <header className="space-y-1">
        <h2 className="text-2xl font-semibold">Deal pipeline</h2>
        <p className="text-sm text-muted-foreground">
          Track outreach, status, and buyer feedback as you progress this project through the pipeline.
        </p>
      </header>

      {banner ? (
        <div
          className={`rounded-md border px-4 py-3 text-sm ${
            banner.type === 'success'
              ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-900'
              : 'border-red-500/20 bg-red-500/10 text-red-900'
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <span>{banner.message}</span>
            <button
              type="button"
              onClick={() => setBanner(null)}
              className="text-xs font-medium uppercase tracking-wide text-current"
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          {metaLoading ? (
            <div className="animate-pulse space-y-3 rounded-xl border border-border bg-card p-4">
              <div className="h-6 w-32 rounded bg-muted" />
              <div className="h-24 rounded bg-muted" />
            </div>
          ) : meta ? (
            <div className="space-y-4">
              <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${STATUS_BADGES[status]}`}>
                Current status: {statusLabel(status)}
              </div>
              <StatusSelect value={status} onChange={handleStatusChange} />
              <FeedbackEditor
                projectId={projectId}
                initialValue={meta.feedback}
                onSaved={handleFeedbackSaved}
                onError={handleError}
              />
            </div>
          ) : null}

          <OutreachForm projectId={projectId} onCreated={handleOutreachCreated} onError={handleError} />
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-medium">Outreach history</h3>
              <p className="text-sm text-muted-foreground">Most recent outreach appears first.</p>
            </div>
            <input
              type="search"
              placeholder="Search contact or notes"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-48 rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>

          <div className="overflow-hidden rounded-xl border border-border">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th scope="col" className="px-4 py-2 text-left font-medium text-muted-foreground">
                    Channel
                  </th>
                  <th scope="col" className="px-4 py-2 text-left font-medium text-muted-foreground">
                    Contact
                  </th>
                  <th scope="col" className="px-4 py-2 text-left font-medium text-muted-foreground">
                    Note
                  </th>
                  <th scope="col" className="px-4 py-2 text-left font-medium text-muted-foreground">
                    Follow-up
                  </th>
                  <th scope="col" className="px-4 py-2 text-left font-medium text-muted-foreground">
                    Logged
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {logsLoading ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                      Loading outreach…
                    </td>
                  </tr>
                ) : outreach.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                      No outreach yet. Log your first contact.
                    </td>
                  </tr>
                ) : (
                  outreach.map((item) => (
                    <tr key={item.id}>
                      <td className="px-4 py-3 font-medium capitalize">{item.channel}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{item.contact || '—'}</td>
                      <td className="px-4 py-3 text-sm">
                        <span title={item.note} className="block max-w-sm truncate">
                          {item.note}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {item.next_follow_up_at
                          ? `Follow-up on ${new Date(item.next_follow_up_at).toLocaleString()}`
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {new Date(item.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <footer className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Showing {outreach.length} of {outreachCount} logs
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(0, current - 1))}
                disabled={page === 0 || logsLoading}
                className="rounded-md border border-border px-3 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50"
              >
                Previous
              </button>
              <span>
                Page {outreachCount === 0 ? 0 : page + 1} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((current) => (current + 1 < totalPages ? current + 1 : current))}
                disabled={page + 1 >= totalPages || logsLoading}
                className="rounded-md border border-border px-3 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </footer>
        </div>
      </div>
    </section>
  );
}

function statusLabel(status: DealStatus): string {
  const labels: Record<DealStatus, string> = {
    lead: 'Lead',
    contacted: 'Contacted',
    qualified: 'Qualified',
    proposal: 'Proposal',
    negotiation: 'Negotiation',
    won: 'Won',
    lost: 'Lost',
  };
  return labels[status];
}
