import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

// Import the actual components for integration testing
import { SignUpForm } from '../../src/components/forms/SignUpForm';

// Mock only external dependencies, not our components
jest.mock('lucide-react', () => ({
  Eye: () => <div data-testid="eye-icon">👁</div>,
  EyeOff: () => <div data-testid="eye-off-icon">🙈</div>,
  User: () => <div data-testid="user-icon">👤</div>,
  Mail: () => <div data-testid="mail-icon">📧</div>,
  Lock: () => <div data-testid="lock-icon">🔒</div>,
  CheckCircle: () => <div data-testid="check-circle-icon">✅</div>,
  X: () => <div data-testid="x-icon">✕</div>,
  Check: () => <div data-testid="check-icon">✓</div>,
  AlertCircle: () => <div data-testid="alert-circle-icon">⚠</div>,
}));

describe('Sign-Up Flow Integration', () => {
  const mockOnSubmit = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const fillBasicForm = async (user: any) => {
    await user.type(screen.getByLabelText(/full name/i), 'Test User');
    await user.type(screen.getByLabelText(/email address/i), 'test@example.com');
    await user.type(screen.getByLabelText('Password'), 'TestPassword123');
    await user.type(screen.getByLabelText(/confirm password/i), 'TestPassword123');
    await user.click(screen.getByLabelText(/i accept the/i));
  };

  describe('Complete Sign-Up Flow', () => {
    it('requires Creator\'s Bill of Rights acknowledgment before enabling submit', async () => {
      const user = userEvent.setup();
      render(<SignUpForm onSubmit={mockOnSubmit} />);

      // Fill basic form
      await fillBasicForm(user);

      // Submit button should be disabled without consent
      const submitButton = screen.getByRole('button', { name: /create account/i });
      expect(submitButton).toBeDisabled();

      // Error message should be shown
      expect(screen.getByText(/you must review and acknowledge the creator's bill of rights/i)).toBeInTheDocument();
    });

    it('enables submit button after completing Creator\'s Bill of Rights', async () => {
      const user = userEvent.setup();
      render(<SignUpForm onSubmit={mockOnSubmit} />);

      // Fill basic form
      await fillBasicForm(user);

      // Open consent modal
      const reviewButton = screen.getByRole('button', { name: /review rights/i });
      await user.click(reviewButton);

      // Modal should be open
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Creator\'s Bill of Rights')).toBeInTheDocument();

      // Check all required statements
      const checkboxes = screen.getAllByRole('checkbox');
      const consentCheckboxes = checkboxes.filter(cb =>
        cb.getAttribute('id')?.startsWith('checkbox-')
      );

      for (const checkbox of consentCheckboxes) {
        await user.click(checkbox);
      }

      // Continue button should be enabled
      const continueButton = screen.getByRole('button', { name: /continue to sign up/i });
      await waitFor(() => {
        expect(continueButton).toBeEnabled();
      });

      // Complete consent
      await user.click(continueButton);

      // Modal should close and acknowledgment should be shown
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(screen.getByText('Acknowledged')).toBeInTheDocument();
      });

      // Submit button should now be enabled
      const submitButton = screen.getByRole('button', { name: /create account/i });
      await waitFor(() => {
        expect(submitButton).toBeEnabled();
      });
    });

    it('submits complete form data including consent information', async () => {
      const user = userEvent.setup();
      render(<SignUpForm onSubmit={mockOnSubmit} />);

      // Fill basic form
      await fillBasicForm(user);

      // Select founder role
      await user.click(screen.getByRole('radio', { name: /founder/i }));

      // Complete consent flow
      await user.click(screen.getByRole('button', { name: /review rights/i }));

      const consentCheckboxes = screen.getAllByRole('checkbox').filter(cb =>
        cb.getAttribute('id')?.startsWith('checkbox-')
      );

      for (const checkbox of consentCheckboxes) {
        await user.click(checkbox);
      }

      await user.click(screen.getByRole('button', { name: /continue to sign up/i }));

      // Wait for modal to close
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });

      // Submit form
      const submitButton = screen.getByRole('button', { name: /create account/i });
      await waitFor(() => {
        expect(submitButton).toBeEnabled();
      });

      await user.click(submitButton);

      // Verify submission data
      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            fullName: 'Test User',
            email: 'test@example.com',
            password: 'TestPassword123',
            confirmPassword: 'TestPassword123',
            role: 'founder',
            acceptTerms: true,
            consents: expect.objectContaining({
              'content-ownership': true,
              'fair-compensation': true,
              'creative-freedom': true,
              'data-privacy': true,
              'platform-changes': true,
              'content-removal': true,
            }),
            consentData: expect.objectContaining({
              consents: expect.any(Object),
              timestamp: expect.any(String),
              version: '1.0',
            }),
          })
        );
      });
    });

    it('allows reopening consent modal to view rights after completion', async () => {
      const user = userEvent.setup();
      render(<SignUpForm onSubmit={mockOnSubmit} />);

      // Fill basic form and complete consent
      await fillBasicForm(user);
      await user.click(screen.getByRole('button', { name: /review rights/i }));

      const consentCheckboxes = screen.getAllByRole('checkbox').filter(cb =>
        cb.getAttribute('id')?.startsWith('checkbox-')
      );

      for (const checkbox of consentCheckboxes) {
        await user.click(checkbox);
      }

      await user.click(screen.getByRole('button', { name: /continue to sign up/i }));

      // Wait for completion
      await waitFor(() => {
        expect(screen.getByText('Acknowledged')).toBeInTheDocument();
      });

      // Should now show "View Rights" button
      const viewButton = screen.getByRole('button', { name: /view rights/i });
      expect(viewButton).toBeInTheDocument();

      // Clicking should reopen modal
      await user.click(viewButton);
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      // All checkboxes should still be checked
      const reopenedCheckboxes = screen.getAllByRole('checkbox').filter(cb =>
        cb.getAttribute('id')?.startsWith('checkbox-')
      );

      reopenedCheckboxes.forEach(checkbox => {
        expect(checkbox).toBeChecked();
      });
    });
  });

  describe('Error Handling', () => {
    it('shows validation errors when submitting incomplete consent', async () => {
      const user = userEvent.setup();
      render(<SignUpForm onSubmit={mockOnSubmit} />);

      // Fill basic form
      await fillBasicForm(user);

      // Open consent modal but don't complete all consents
      await user.click(screen.getByRole('button', { name: /review rights/i }));

      // Check only some checkboxes
      const checkboxes = screen.getAllByRole('checkbox').filter(cb =>
        cb.getAttribute('id')?.startsWith('checkbox-')
      );

      if (checkboxes.length > 0) {
        await user.click(checkboxes[0]); // Check only first one
      }

      // Try to continue
      const continueButton = screen.getByRole('button', { name: /continue to sign up/i });
      await user.click(continueButton);

      // Should show error message
      expect(screen.getByText(/please acknowledge all required statements/i)).toBeInTheDocument();

      // Should show specific missing consents
      expect(screen.getByText(/requires consent/i)).toBeInTheDocument();
    });

    it('prevents form submission during loading state', async () => {
      const user = userEvent.setup();
      render(<SignUpForm onSubmit={mockOnSubmit} isLoading={true} />);

      // Fill basic form
      await fillBasicForm(user);

      // Complete consent
      await user.click(screen.getByRole('button', { name: /review rights/i }));

      const consentCheckboxes = screen.getAllByRole('checkbox').filter(cb =>
        cb.getAttribute('id')?.startsWith('checkbox-')
      );

      for (const checkbox of consentCheckboxes) {
        await user.click(checkbox);
      }

      await user.click(screen.getByRole('button', { name: /continue to sign up/i }));

      // Submit button should be disabled due to loading
      await waitFor(() => {
        const submitButton = screen.getByRole('button', { name: /creating account/i });
        expect(submitButton).toBeDisabled();
      });
    });
  });

  describe('Accessibility', () => {
    it('maintains proper focus flow through the sign-up process', async () => {
      const user = userEvent.setup();
      render(<SignUpForm onSubmit={mockOnSubmit} />);

      // Tab through form fields
      await user.tab();
      expect(screen.getByLabelText(/full name/i)).toHaveFocus();

      await user.tab();
      expect(screen.getByLabelText(/email address/i)).toHaveFocus();

      await user.tab();
      expect(screen.getByLabelText('Password')).toHaveFocus();

      // Continue tabbing to consent section
      await user.tab(); // Confirm password
      await user.tab(); // Eye icon
      await user.tab(); // Creator radio
      await user.tab(); // Founder radio
      await user.tab(); // Review Rights button

      expect(screen.getByRole('button', { name: /review rights/i })).toHaveFocus();
    });

    it('properly manages focus in consent modal', async () => {
      const user = userEvent.setup();
      render(<SignUpForm onSubmit={mockOnSubmit} />);

      // Open consent modal
      await user.click(screen.getByRole('button', { name: /review rights/i }));

      // First checkbox should be focused
      await waitFor(() => {
        const firstCheckbox = screen.getAllByRole('checkbox').find(cb =>
          cb.getAttribute('id')?.startsWith('checkbox-')
        );
        expect(firstCheckbox).toHaveFocus();
      });
    });

    it('announces consent completion to screen readers', async () => {
      const user = userEvent.setup();
      render(<SignUpForm onSubmit={mockOnSubmit} />);

      // Complete consent flow
      await user.click(screen.getByRole('button', { name: /review rights/i }));

      const consentCheckboxes = screen.getAllByRole('checkbox').filter(cb =>
        cb.getAttribute('id')?.startsWith('checkbox-')
      );

      for (const checkbox of consentCheckboxes) {
        await user.click(checkbox);
      }

      await user.click(screen.getByRole('button', { name: /continue to sign up/i }));

      // Should have accessible acknowledgment indicator
      await waitFor(() => {
        const acknowledgment = screen.getByText('Acknowledged');
        expect(acknowledgment).toBeInTheDocument();

        // Should be in a region with proper semantics
        const checkIcon = screen.getByTestId('check-circle-icon');
        expect(checkIcon).toBeInTheDocument();
      });
    });
  });

  describe('Form State Persistence', () => {
    it('preserves form data when consent modal is opened and closed', async () => {
      const user = userEvent.setup();
      render(<SignUpForm onSubmit={mockOnSubmit} />);

      // Fill form data
      await user.type(screen.getByLabelText(/full name/i), 'Persistent User');
      await user.type(screen.getByLabelText(/email address/i), 'persistent@example.com');
      await user.click(screen.getByRole('radio', { name: /founder/i }));

      // Open and close consent modal without completing
      await user.click(screen.getByRole('button', { name: /review rights/i }));
      await user.click(screen.getByRole('button', { name: /cancel/i }));

      // Form data should be preserved
      expect(screen.getByLabelText(/full name/i)).toHaveValue('Persistent User');
      expect(screen.getByLabelText(/email address/i)).toHaveValue('persistent@example.com');
      expect(screen.getByRole('radio', { name: /founder/i })).toBeChecked();
    });
  });
});