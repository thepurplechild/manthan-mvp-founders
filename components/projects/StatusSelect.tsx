'use client';

import { useState } from 'react';

import type { DealStatus } from '@/lib/projects/deal-schema';

const STATUS_LABELS: Record<DealStatus, string> = {
  lead: 'Lead',
  contacted: 'Contacted',
  qualified: 'Qualified',
  proposal: 'Proposal Sent',
  negotiation: 'Negotiation',
  won: 'Won',
  lost: 'Lost',
};

const STATUS_HELPER: Record<DealStatus, string> = {
  lead: 'Prospect identified, not yet contacted',
  contacted: 'First outreach sent',
  qualified: 'Buyer expressed interest',
  proposal: 'Proposal or deck shared',
  negotiation: 'Active negotiation in progress',
  won: 'Deal closed successfully',
  lost: 'Opportunity closed without success',
};

interface StatusSelectProps {
  value: DealStatus;
  onChange: (status: DealStatus) => Promise<void>;
}

export default function StatusSelect({ value, onChange }: StatusSelectProps): JSX.Element {
  const [pending, setPending] = useState(false);

  const handleChange = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    const next = event.target.value as DealStatus;
    setPending(true);
    try {
      await onChange(next);
    } catch (error) {
      console.error('[deal-status] update failed', error);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-2 rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-1">
        <label htmlFor="deal-status" className="text-sm font-medium">
          Deal status
        </label>
        <select
          id="deal-status"
          value={value}
          onChange={handleChange}
          disabled={pending}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          {Object.entries(STATUS_LABELS).map(([status, label]) => (
            <option key={status} value={status}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <p className="text-xs text-muted-foreground">{STATUS_HELPER[value]}</p>
      {pending ? <p className="text-xs text-muted-foreground">Updating…</p> : null}
    </div>
  );
}
