import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import DealPipelineSection from '@/components/projects/DealPipelineSection';

const mockGetDealMeta = vi.fn();
const mockListOutreach = vi.fn();
const mockUpdateDealStatus = vi.fn();
const mockUpdateDealFeedback = vi.fn();
const mockCreateOutreach = vi.fn();

vi.mock('@/lib/projects/deal-api', () => ({
  getDealMeta: (...args: unknown[]) => mockGetDealMeta(...args),
  listOutreach: (...args: unknown[]) => mockListOutreach(...args),
  updateDealStatus: (...args: unknown[]) => mockUpdateDealStatus(...args),
  updateDealFeedback: (...args: unknown[]) => mockUpdateDealFeedback(...args),
  createOutreach: (...args: unknown[]) => mockCreateOutreach(...args),
}));

describe('DealPipelineSection', () => {
  beforeEach(() => {
    const metaState = {
      project_id: 'project-1',
      status: 'lead' as const,
      feedback: null,
      updated_at: new Date().toISOString(),
    };

    mockGetDealMeta.mockResolvedValue({ ...metaState });

    let outreachState = [
      {
        id: 'log-1',
        project_id: 'project-1',
        channel: 'email',
        contact: 'buyer@example.com',
        note: 'Intro email sent',
        next_follow_up_at: null,
        created_by: 'user-1',
        created_at: '2024-09-02T10:00:00.000Z',
      },
    ];

    mockListOutreach.mockImplementation(async () => ({
      data: outreachState,
      count: outreachState.length,
    }));

    mockUpdateDealStatus.mockImplementation(async (_projectId: string, status: string) => ({
      ...metaState,
      status,
    }));

    mockUpdateDealFeedback.mockImplementation(async (_projectId: string, input: { feedback?: string | null }) => ({
      ...metaState,
      feedback: input.feedback ?? null,
      updated_at: new Date().toISOString(),
    }));

    mockCreateOutreach.mockImplementation(async (_projectId: string, input: Record<string, unknown>) => {
      const record = {
        id: `log-${Math.random().toString(36).slice(2, 8)}`,
        project_id: 'project-1',
        channel: input.channel as string,
        contact: (input.contact as string) || null,
        note: input.note as string,
        next_follow_up_at: (input.next_follow_up_at as string) || null,
        created_by: 'user-1',
        created_at: new Date().toISOString(),
      };
      outreachState = [record, ...outreachState];
      return record;
    });

    mockGetDealMeta.mockClear();
    mockListOutreach.mockClear();
    mockUpdateDealStatus.mockClear();
    mockUpdateDealFeedback.mockClear();
    mockCreateOutreach.mockClear();
  });

  it('creates outreach and refreshes the list', async () => {
    render(<DealPipelineSection projectId="project-1" />);

    await screen.findByText('Intro email sent');

    await userEvent.type(screen.getByLabelText('Note'), 'Called buyer, left voicemail');
    await userEvent.click(screen.getByRole('button', { name: /log outreach/i }));

    await screen.findByText('Outreach logged.');
    await screen.findByText('Called buyer, left voicemail');
    expect(mockCreateOutreach).toHaveBeenCalledTimes(1);
  });

  it('updates status when selection changes', async () => {
    render(<DealPipelineSection projectId="project-1" />);

    await screen.findByText('Intro email sent');

    const select = screen.getByLabelText('Deal status');
    await userEvent.selectOptions(select, 'won');

    await screen.findByText('Status updated to Won.');
    await screen.findByText('Current status: Won');
    expect(mockUpdateDealStatus).toHaveBeenCalledWith('project-1', 'won');
  });

  it('saves feedback via editor', async () => {
    render(<DealPipelineSection projectId="project-1" />);

    const textarea = await screen.findByLabelText('Buyer feedback');
    await userEvent.type(textarea, 'Positive sentiment, waiting on budget');

    await userEvent.click(screen.getByRole('button', { name: /save feedback/i }));

    await screen.findByText('Feedback saved.');
    expect(mockUpdateDealFeedback).toHaveBeenCalled();
  });

  it('surfaces errors when status update fails', async () => {
    mockUpdateDealStatus.mockRejectedValueOnce(new Error('network error'));

    render(<DealPipelineSection projectId="project-1" />);

    const select = await screen.findByLabelText('Deal status');
    await userEvent.selectOptions(select, 'qualified');

    await screen.findByText('Failed to update status.');
  });
});
