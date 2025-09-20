import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import MandatesPage from '@/app/(founder)/mandates/page';
import * as mandatesApi from '@/lib/mandates/api';

vi.mock('@hookform/resolvers/zod', () => ({
  zodResolver: (schema: any) => (values: unknown) => {
    const parsed = schema.safeParse(values);
    if (parsed.success) {
      return { values: parsed.data, errors: {} };
    }
    const fieldErrors: Record<string, any> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.join('.') || 'root';
      fieldErrors[path] = { type: issue.code, message: issue.message };
    }
    return { values: {}, errors: fieldErrors };
  },
}));

vi.mock('@/lib/mandates/api', () => {
  type MandateRecord = {
    id: string;
    code: string;
    title: string;
    description: string | null;
    is_active: boolean;
    created_by: string | null;
    created_at: string;
    updated_at: string;
  };

  let records: MandateRecord[] = [];

  function filterRecords(search?: string) {
    if (!search) return records;
    const value = search.toLowerCase();
    return records.filter(
      (record) =>
        record.code.toLowerCase().includes(value) || record.title.toLowerCase().includes(value)
    );
  }

  return {
    async listMandates({ search, limit = 10, offset = 0 }: any) {
      const filtered = filterRecords(search);
      return {
        data: filtered.slice(offset, offset + limit),
        count: filtered.length,
      };
    },
    async createMandate(input: any) {
      const now = new Date().toISOString();
      const mandate = {
        id: `id-${Math.random().toString(36).slice(2)}`,
        code: input.code,
        title: input.title,
        description: input.description ?? null,
        is_active: input.is_active,
        created_by: 'founder-1',
        created_at: now,
        updated_at: now,
      };
      records = [mandate, ...records];
      return mandate;
    },
    async updateMandate(id: string, input: any) {
      let updatedItem: MandateRecord | null = null;
      records = records.map((record) => {
        if (record.id !== id) return record;
        updatedItem = {
          ...record,
          ...input,
          description: input.description ?? record.description,
          updated_at: new Date().toISOString(),
        };
        return updatedItem;
      });
      if (!updatedItem) {
        throw new Error('Mandate not found');
      }
      return updatedItem;
    },
    async deleteMandate(id: string) {
      records = records.filter((record) => record.id !== id);
    },
    __setMockRecords(next: MandateRecord[]) {
      records = next;
    },
  };
});

type MockedMandatesApi = typeof mandatesApi & {
  __setMockRecords: (records: Array<{
    id: string;
    code: string;
    title: string;
    description: string | null;
    is_active: boolean;
    created_by: string | null;
    created_at: string;
    updated_at: string;
  }>) => void;
};

const api = mandatesApi as unknown as MockedMandatesApi;
const { __setMockRecords } = api;
const listMandatesMock = vi.mocked(api.listMandates);
const createMandateMock = vi.mocked(api.createMandate);
const updateMandateMock = vi.mocked(api.updateMandate);
const deleteMandateMock = vi.mocked(api.deleteMandate);

describe('Mandates founder page', () => {
  const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

  beforeEach(() => {
    __setMockRecords([
      {
        id: '1',
        code: 'NETFLIX_FAMILY',
        title: 'Netflix family drama focus',
        description: 'Family-first limited series guidance',
        is_active: true,
        created_by: 'founder-1',
        created_at: '2024-09-01T12:00:00.000Z',
        updated_at: '2024-09-01T12:00:00.000Z',
      },
      {
        id: '2',
        code: 'AMAZON_ACTION',
        title: 'Amazon action slate',
        description: 'High-octane action titles',
        is_active: false,
        created_by: 'founder-1',
        created_at: '2024-08-20T12:00:00.000Z',
        updated_at: '2024-08-20T12:00:00.000Z',
      },
    ]);

    confirmSpy.mockClear();
    listMandatesMock.mockClear();
    createMandateMock.mockClear();
    updateMandateMock.mockClear();
    deleteMandateMock.mockClear();
  });

  it('creates a mandate and refreshes the table', async () => {
    render(<MandatesPage />);

    await screen.findByText('Netflix family drama focus');

    await userEvent.type(screen.getByLabelText('Code'), 'DISNEY_ANIMATED');
    await userEvent.type(screen.getByLabelText('Title'), 'Disney animated family slate');
    await userEvent.type(screen.getByLabelText('Description'), 'Focus on heartfelt animated stories');

    await userEvent.click(screen.getByRole('button', { name: /create mandate/i }));

    await screen.findByText('Mandate “Disney animated family slate” created.');
    await screen.findByText('Disney animated family slate');

    expect(createMandateMock).toHaveBeenCalledTimes(1);
  });

  it('edits a mandate inline', async () => {
    render(<MandatesPage />);
    await screen.findByText('Netflix family drama focus');

    const row = screen.getByText('Netflix family drama focus').closest('tr');
    expect(row).toBeTruthy();
    const editButton = within(row as HTMLElement).getByRole('button', { name: /edit/i });
    await userEvent.click(editButton);

    const titleInput = screen.getByLabelText(/title/i);
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, 'Updated Netflix Mandate');

    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await screen.findByText('Mandate “Updated Netflix Mandate” updated.');
    await screen.findByText('Updated Netflix Mandate');
    expect(updateMandateMock).toHaveBeenCalled();
  });

  it('toggles active state with optimistic update', async () => {
    render(<MandatesPage />);
    await screen.findByText('Amazon action slate');

    const row = screen.getByText('Amazon action slate').closest('tr');
    expect(row).toBeTruthy();
    const toggle = within(row as HTMLElement).getByRole('checkbox');

    expect(toggle).not.toBeChecked();
    await userEvent.click(toggle);

    await screen.findByText('Mandate “Amazon action slate” updated.');
    expect(updateMandateMock).toHaveBeenCalled();
  });

  it('deletes a mandate after confirmation', async () => {
    render(<MandatesPage />);
    await screen.findByText('Amazon action slate');

    const row = screen.getByText('Amazon action slate').closest('tr');
    const deleteButton = within(row as HTMLElement).getByRole('button', { name: /delete/i });
    await userEvent.click(deleteButton);

    await waitFor(() => expect(deleteMandateMock).toHaveBeenCalled());
    await screen.findByText('Mandate deleted.');
    expect(screen.queryByText('Amazon action slate')).toBeNull();
  });

  it('surfaces errors from Supabase', async () => {
    createMandateMock.mockRejectedValueOnce(new Error('duplicate code'));

    render(<MandatesPage />);

    await screen.findByText('Netflix family drama focus');

    await userEvent.type(screen.getByLabelText('Code'), 'NETFLIX_FAMILY');
    await userEvent.type(screen.getByLabelText('Title'), 'Duplicate code test');
    await userEvent.click(screen.getByRole('button', { name: /create mandate/i }));

    await screen.findByText('duplicate code');
  });
});
