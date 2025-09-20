'use client';

import { format } from 'date-fns';
import type { DealStatus } from '@/lib/zod/deal';

export interface DealPipelineEntry {
  id: string;
  target_buyer_name: string;
  status: DealStatus;
  feedback_notes?: string | null;
  created_at: string;
}

const STATUS_LABELS: Record<DealStatus, string> = {
  introduced: 'Introduced',
  in_discussion: 'In discussion',
  passed: 'Passed',
  deal_closed: 'Deal closed',
};

const STATUS_CLASSES: Record<DealStatus, string> = {
  introduced: 'bg-slate-200 text-slate-800',
  in_discussion: 'bg-amber-200 text-amber-900',
  passed: 'bg-rose-200 text-rose-900',
  deal_closed: 'bg-emerald-200 text-emerald-900',
};

interface DealPipelineTableProps {
  entries: DealPipelineEntry[];
}

export default function DealPipelineTable({ entries }: DealPipelineTableProps): JSX.Element {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No outreach recorded yet. Add the first deal pipeline entry for this project.
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="min-w-full divide-y divide-border text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th scope="col" className="px-4 py-2 text-left font-medium text-muted-foreground">Buyer</th>
            <th scope="col" className="px-4 py-2 text-left font-medium text-muted-foreground">Status</th>
            <th scope="col" className="px-4 py-2 text-left font-medium text-muted-foreground">Notes</th>
            <th scope="col" className="px-4 py-2 text-left font-medium text-muted-foreground">Logged</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {entries.map((entry) => (
            <tr key={entry.id} className="bg-card">
              <td className="px-4 py-3 font-medium text-foreground">{entry.target_buyer_name}</td>
              <td className="px-4 py-3">
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_CLASSES[entry.status]}`}>
                  {STATUS_LABELS[entry.status]}
                </span>
              </td>
              <td className="px-4 py-3 text-sm text-muted-foreground">
                {entry.feedback_notes ? entry.feedback_notes : <span className="italic text-muted-foreground/80">None</span>}
              </td>
              <td className="px-4 py-3 text-xs text-muted-foreground">
                {format(new Date(entry.created_at), 'PPP p')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
