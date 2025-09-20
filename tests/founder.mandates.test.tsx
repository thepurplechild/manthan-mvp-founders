import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import MandateForm, { type MandateFormState } from '@/components/founder/MandateForm';

function createActionMock(result: MandateFormState) {
  const action = vi.fn(async (_prev: MandateFormState, formData: FormData) => {
    expect(formData.get('platform_name')).toBe('Netflix');
    expect(formData.get('mandate_description')).toBe('High priority slate');
    return result;
  });
  return action;
}

describe('MandateForm', () => {
  it('submits successfully and resets the form', async () => {
    const action = createActionMock({ ok: true, error: null });
    render(<MandateForm action={action} />);

    await userEvent.type(screen.getByLabelText(/platform name/i), 'Netflix');
    await userEvent.type(screen.getByLabelText(/Mandate description/i), 'High priority slate');
    await userEvent.click(screen.getByRole('button', { name: /create mandate/i }));

    await screen.findByText(/Mandate created successfully/i);
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('shows validation error from server action', async () => {
    const action = vi.fn(async () => ({ ok: false, error: 'Duplicate entry' }));
    render(<MandateForm action={action} />);

    await userEvent.type(screen.getByLabelText(/platform name/i), 'Netflix');
    await userEvent.type(screen.getByLabelText(/Mandate description/i), 'High priority slate');
    await userEvent.click(screen.getByRole('button', { name: /create mandate/i }));

    await screen.findByText(/Duplicate entry/i);
  });
});
