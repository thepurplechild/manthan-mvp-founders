import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import DealPipelineSection from '@/components/founder/DealPipelineSection';
import type { DealPipelineFormState } from '@/components/founder/DealPipelineForm';

const refreshMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

describe('DealPipelineSection', () => {
  beforeEach(() => {
    refreshMock.mockReset();
  });

  it('creates a deal entry and refreshes router', async () => {
    const action = vi.fn(async (_prev: DealPipelineFormState, formData: FormData) => {
      expect(formData.get('project_id')).toBe('proj-1');
      expect(formData.get('target_buyer_name')).toBe('Prime Video');
      return { ok: true, error: null };
    });

    render(
      <DealPipelineSection
        projectId="proj-1"
        createEntryAction={action}
        entries={[
          { id: '1', target_buyer_name: 'Netflix', status: 'introduced', feedback_notes: null, created_at: '2024-01-01T00:00:00Z' },
        ]}
      />
    );

    await userEvent.type(screen.getByLabelText(/Target buyer name/i), 'Prime Video');
    await userEvent.selectOptions(screen.getByLabelText(/Status/i), 'deal_closed');
    await userEvent.click(screen.getByRole('button', { name: /Add entry/i }));

    await waitFor(() => expect(action).toHaveBeenCalled());
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    await screen.findByText(/Deal entry created successfully/i);
  });

  it('renders entries with status badges', () => {
    render(
      <DealPipelineSection
        projectId="proj-1"
        createEntryAction={vi.fn()}
        entries={[
          { id: '1', target_buyer_name: 'Disney+', status: 'passed', feedback_notes: 'Not a fit right now', created_at: '2024-01-01T00:00:00Z' },
        ]}
      />
    );

    expect(screen.getByText('Disney+')).toBeInTheDocument();
    expect(screen.getByText(/Passed/i)).toBeInTheDocument();
  });
});
