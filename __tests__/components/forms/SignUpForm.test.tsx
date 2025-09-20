import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

import { SignUpForm } from '../../../src/components/forms/SignUpForm';

// Mock the consent modal and hooks
jest.mock('../../../src/components/modals/CreatorBillOfRightsModal', () => {
  return function MockCreatorBillOfRightsModal({ isOpen, onConsentComplete, onClose }: any) {
    if (!isOpen) return null;

    return (
      <div data-testid="consent-modal">
        <h2>Creator's Bill of Rights</h2>
        <button
          onClick={() => onConsentComplete({
            'content-ownership': true,
            'fair-compensation': true,
            'creative-freedom': true,
            'data-privacy': true,
            'platform-changes': true,
            'content-removal': true,
          })}
        >
          Accept All Rights
        </button>
        <button onClick={onClose}>Cancel</button>
      </div>
    );
  };
});

jest.mock('../../../src/hooks/useConsent', () => ({
  useConsentFormIntegration: () => ({
    consentStatus: {},
    isConsentComplete: false,
    isConsentModalOpen: false,
    openConsentModal: jest.fn(),
    closeConsentModal: jest.fn(),
    validateConsents: () => ({ isValid: false, errors: [], missingConsents: [] }),
  }),
}));

// Mock Lucide React icons
jest.mock('lucide-react', () => ({
  Eye: () => <div data-testid="eye-icon">👁</div>,
  EyeOff: () => <div data-testid="eye-off-icon">🙈</div>,
  User: () => <div data-testid="user-icon">👤</div>,
  Mail: () => <div data-testid="mail-icon">📧</div>,
  Lock: () => <div data-testid="lock-icon">🔒</div>,
  CheckCircle: () => <div data-testid="check-circle-icon">✅</div>,
}));

describe('SignUpForm', () => {
  const mockOnSubmit = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const defaultProps = {
    onSubmit: mockOnSubmit,
    isLoading: false,
  };

  describe('Form Rendering', () => {
    it('renders all form fields', () => {
      render(<SignUpForm {...defaultProps} />);

      expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
      expect(screen.getByLabelText('Password')).toBeInTheDocument();
      expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
      expect(screen.getByText(/account type/i)).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: /creator/i })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: /founder/i })).toBeInTheDocument();
    });

    it('renders Creator\'s Bill of Rights section', () => {
      render(<SignUpForm {...defaultProps} />);

      expect(screen.getByText('Creator\'s Bill of Rights')).toBeInTheDocument();
      expect(screen.getByText(/review and acknowledge our creator protection policies/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /review rights/i })).toBeInTheDocument();
    });

    it('renders terms and conditions checkbox', () => {
      render(<SignUpForm {...defaultProps} />);

      expect(screen.getByRole('checkbox')).toBeInTheDocument();
      expect(screen.getByText(/i accept the/i)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /terms and conditions/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /privacy policy/i })).toBeInTheDocument();
    });

    it('renders disabled submit button initially', () => {
      render(<SignUpForm {...defaultProps} />);

      const submitButton = screen.getByRole('button', { name: /create account/i });
      expect(submitButton).toBeDisabled();
    });
  });

  describe('Form Validation', () => {
    it('shows validation errors for empty required fields', async () => {
      const user = userEvent.setup();
      render(<SignUpForm {...defaultProps} />);

      const submitButton = screen.getByRole('button', { name: /create account/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/full name is required/i)).toBeInTheDocument();
        expect(screen.getByText(/email is required/i)).toBeInTheDocument();
        expect(screen.getByText(/password is required/i)).toBeInTheDocument();
      });
    });

    it('validates email format', async () => {
      const user = userEvent.setup();
      render(<SignUpForm {...defaultProps} />);

      const emailInput = screen.getByLabelText(/email address/i);
      await user.type(emailInput, 'invalid-email');
      await user.tab();

      await waitFor(() => {
        expect(screen.getByText(/invalid email address/i)).toBeInTheDocument();
      });
    });

    it('validates password requirements', async () => {
      const user = userEvent.setup();
      render(<SignUpForm {...defaultProps} />);

      const passwordInput = screen.getByLabelText('Password');
      await user.type(passwordInput, 'weak');
      await user.tab();

      await waitFor(() => {
        expect(screen.getByText(/password must be at least 8 characters/i)).toBeInTheDocument();
      });
    });

    it('validates password confirmation match', async () => {
      const user = userEvent.setup();
      render(<SignUpForm {...defaultProps} />);

      const passwordInput = screen.getByLabelText('Password');
      const confirmPasswordInput = screen.getByLabelText(/confirm password/i);

      await user.type(passwordInput, 'Password123');
      await user.type(confirmPasswordInput, 'Different123');
      await user.tab();

      await waitFor(() => {
        expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
      });
    });
  });

  describe('Password Visibility Toggle', () => {
    it('toggles password visibility', async () => {
      const user = userEvent.setup();
      render(<SignUpForm {...defaultProps} />);

      const passwordInput = screen.getByLabelText('Password');
      const toggleButton = passwordInput.parentElement?.querySelector('button');

      expect(passwordInput).toHaveAttribute('type', 'password');

      if (toggleButton) {
        await user.click(toggleButton);
        expect(passwordInput).toHaveAttribute('type', 'text');

        await user.click(toggleButton);
        expect(passwordInput).toHaveAttribute('type', 'password');
      }
    });

    it('toggles confirm password visibility', async () => {
      const user = userEvent.setup();
      render(<SignUpForm {...defaultProps} />);

      const confirmPasswordInput = screen.getByLabelText(/confirm password/i);
      const toggleButton = confirmPasswordInput.parentElement?.querySelector('button');

      expect(confirmPasswordInput).toHaveAttribute('type', 'password');

      if (toggleButton) {
        await user.click(toggleButton);
        expect(confirmPasswordInput).toHaveAttribute('type', 'text');
      }
    });
  });

  describe('Role Selection', () => {
    it('defaults to creator role', () => {
      render(<SignUpForm {...defaultProps} />);

      const creatorRadio = screen.getByRole('radio', { name: /creator/i });
      const founderRadio = screen.getByRole('radio', { name: /founder/i });

      expect(creatorRadio).toBeChecked();
      expect(founderRadio).not.toBeChecked();
    });

    it('allows role selection change', async () => {
      const user = userEvent.setup();
      render(<SignUpForm {...defaultProps} />);

      const founderRadio = screen.getByRole('radio', { name: /founder/i });
      await user.click(founderRadio);

      expect(founderRadio).toBeChecked();
      expect(screen.getByRole('radio', { name: /creator/i })).not.toBeChecked();
    });
  });

  describe('Creator\'s Bill of Rights Integration', () => {
    it('opens consent modal when Review Rights button is clicked', async () => {
      const user = userEvent.setup();

      // Mock the hook to return a function we can track
      const mockOpenConsentModal = jest.fn();
      jest.doMock('../../../src/hooks/useConsent', () => ({
        useConsentFormIntegration: () => ({
          consentStatus: {},
          isConsentComplete: false,
          isConsentModalOpen: false,
          openConsentModal: mockOpenConsentModal,
          closeConsentModal: jest.fn(),
          validateConsents: () => ({ isValid: false, errors: [], missingConsents: [] }),
        }),
      }));

      render(<SignUpForm {...defaultProps} />);

      const reviewButton = screen.getByRole('button', { name: /review rights/i });
      await user.click(reviewButton);

      expect(mockOpenConsentModal).toHaveBeenCalled();
    });

    it('shows consent modal when open', () => {
      // Mock the hook to show modal as open
      jest.doMock('../../../src/hooks/useConsent', () => ({
        useConsentFormIntegration: () => ({
          consentStatus: {},
          isConsentComplete: false,
          isConsentModalOpen: true,
          openConsentModal: jest.fn(),
          closeConsentModal: jest.fn(),
          validateConsents: () => ({ isValid: false, errors: [], missingConsents: [] }),
        }),
      }));

      render(<SignUpForm {...defaultProps} />);

      expect(screen.getByTestId('consent-modal')).toBeInTheDocument();
    });

    it('shows acknowledgment status when consent is complete', () => {
      // Mock the hook to show completed consent
      jest.doMock('../../../src/hooks/useConsent', () => ({
        useConsentFormIntegration: () => ({
          consentStatus: {
            'content-ownership': true,
            'fair-compensation': true,
            'creative-freedom': true,
            'data-privacy': true,
            'platform-changes': true,
            'content-removal': true,
          },
          isConsentComplete: true,
          isConsentModalOpen: false,
          openConsentModal: jest.fn(),
          closeConsentModal: jest.fn(),
          validateConsents: () => ({ isValid: true, errors: [], missingConsents: [] }),
        }),
      }));

      render(<SignUpForm {...defaultProps} />);

      expect(screen.getByText('Acknowledged')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /view rights/i })).toBeInTheDocument();
    });

    it('shows error message when consent is not complete', () => {
      render(<SignUpForm {...defaultProps} />);

      expect(screen.getByText(/you must review and acknowledge the creator's bill of rights/i)).toBeInTheDocument();
    });
  });

  describe('Submit Button State', () => {
    it('enables submit button when all requirements are met', async () => {
      const user = userEvent.setup();

      // Mock completed consent
      jest.doMock('../../../src/hooks/useConsent', () => ({
        useConsentFormIntegration: () => ({
          consentStatus: {},
          isConsentComplete: true,
          isConsentModalOpen: false,
          openConsentModal: jest.fn(),
          closeConsentModal: jest.fn(),
          validateConsents: () => ({ isValid: true, errors: [], missingConsents: [] }),
        }),
      }));

      render(<SignUpForm {...defaultProps} />);

      // Fill out all required fields
      await user.type(screen.getByLabelText(/full name/i), 'John Doe');
      await user.type(screen.getByLabelText(/email address/i), 'john@example.com');
      await user.type(screen.getByLabelText('Password'), 'Password123');
      await user.type(screen.getByLabelText(/confirm password/i), 'Password123');
      await user.click(screen.getByRole('checkbox'));

      await waitFor(() => {
        const submitButton = screen.getByRole('button', { name: /create account/i });
        expect(submitButton).toBeEnabled();
      });
    });

    it('remains disabled when consent is not complete', async () => {
      const user = userEvent.setup();
      render(<SignUpForm {...defaultProps} />);

      // Fill out all other fields
      await user.type(screen.getByLabelText(/full name/i), 'John Doe');
      await user.type(screen.getByLabelText(/email address/i), 'john@example.com');
      await user.type(screen.getByLabelText('Password'), 'Password123');
      await user.type(screen.getByLabelText(/confirm password/i), 'Password123');
      await user.click(screen.getByRole('checkbox'));

      const submitButton = screen.getByRole('button', { name: /create account/i });
      expect(submitButton).toBeDisabled();
    });

    it('remains disabled when terms are not accepted', async () => {
      const user = userEvent.setup();

      // Mock completed consent
      jest.doMock('../../../src/hooks/useConsent', () => ({
        useConsentFormIntegration: () => ({
          consentStatus: {},
          isConsentComplete: true,
          isConsentModalOpen: false,
          openConsentModal: jest.fn(),
          closeConsentModal: jest.fn(),
          validateConsents: () => ({ isValid: true, errors: [], missingConsents: [] }),
        }),
      }));

      render(<SignUpForm {...defaultProps} />);

      // Fill out all fields except terms checkbox
      await user.type(screen.getByLabelText(/full name/i), 'John Doe');
      await user.type(screen.getByLabelText(/email address/i), 'john@example.com');
      await user.type(screen.getByLabelText('Password'), 'Password123');
      await user.type(screen.getByLabelText(/confirm password/i), 'Password123');

      const submitButton = screen.getByRole('button', { name: /create account/i });
      expect(submitButton).toBeDisabled();
    });
  });

  describe('Form Submission', () => {
    it('calls onSubmit with form data when submitted', async () => {
      const user = userEvent.setup();

      // Mock completed consent
      jest.doMock('../../../src/hooks/useConsent', () => ({
        useConsentFormIntegration: () => ({
          consentStatus: {
            'content-ownership': true,
            'fair-compensation': true,
          },
          isConsentComplete: true,
          isConsentModalOpen: false,
          openConsentModal: jest.fn(),
          closeConsentModal: jest.fn(),
          validateConsents: () => ({ isValid: true, errors: [], missingConsents: [] }),
        }),
      }));

      render(<SignUpForm {...defaultProps} />);

      // Fill out form
      await user.type(screen.getByLabelText(/full name/i), 'John Doe');
      await user.type(screen.getByLabelText(/email address/i), 'john@example.com');
      await user.type(screen.getByLabelText('Password'), 'Password123');
      await user.type(screen.getByLabelText(/confirm password/i), 'Password123');
      await user.click(screen.getByRole('radio', { name: /founder/i }));
      await user.click(screen.getByRole('checkbox'));

      const submitButton = screen.getByRole('button', { name: /create account/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            fullName: 'John Doe',
            email: 'john@example.com',
            password: 'Password123',
            confirmPassword: 'Password123',
            role: 'founder',
            acceptTerms: true,
            consents: {
              'content-ownership': true,
              'fair-compensation': true,
            },
            consentData: expect.objectContaining({
              consents: {
                'content-ownership': true,
                'fair-compensation': true,
              },
              timestamp: expect.any(String),
              version: '1.0',
            }),
          })
        );
      });
    });

    it('shows loading state during submission', () => {
      render(<SignUpForm {...defaultProps} isLoading={true} />);

      const submitButton = screen.getByRole('button', { name: /creating account/i });
      expect(submitButton).toBeDisabled();
      expect(screen.getByText('Creating Account...')).toBeInTheDocument();
    });
  });

  describe('Integration Flow', () => {
    it('completes full sign-up flow with consent modal', async () => {
      const user = userEvent.setup();
      let modalOpen = false;
      let consentComplete = false;

      // Mock dynamic consent state
      jest.doMock('../../../src/hooks/useConsent', () => ({
        useConsentFormIntegration: () => ({
          consentStatus: consentComplete ? { 'content-ownership': true } : {},
          isConsentComplete: consentComplete,
          isConsentModalOpen: modalOpen,
          openConsentModal: () => { modalOpen = true; },
          closeConsentModal: () => { modalOpen = false; },
          validateConsents: () => ({
            isValid: consentComplete,
            errors: [],
            missingConsents: consentComplete ? [] : ['content-ownership']
          }),
        }),
      }));

      const { rerender } = render(<SignUpForm {...defaultProps} />);

      // 1. Fill out basic form fields
      await user.type(screen.getByLabelText(/full name/i), 'Jane Doe');
      await user.type(screen.getByLabelText(/email address/i), 'jane@example.com');
      await user.type(screen.getByLabelText('Password'), 'SecurePass123');
      await user.type(screen.getByLabelText(/confirm password/i), 'SecurePass123');
      await user.click(screen.getByRole('checkbox'));

      // 2. Submit button should be disabled (no consent)
      expect(screen.getByRole('button', { name: /create account/i })).toBeDisabled();

      // 3. Open consent modal
      await user.click(screen.getByRole('button', { name: /review rights/i }));

      // 4. Complete consent in modal
      await user.click(screen.getByText('Accept All Rights'));
      consentComplete = true;
      modalOpen = false;

      // Re-render to reflect state change
      rerender(<SignUpForm {...defaultProps} />);

      // 5. Submit button should now be enabled
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /create account/i })).toBeEnabled();
      });

      // 6. Submit form
      await user.click(screen.getByRole('button', { name: /create account/i }));

      // 7. Verify submission
      expect(mockOnSubmit).toHaveBeenCalled();
    });
  });
});