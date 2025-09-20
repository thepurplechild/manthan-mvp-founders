import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

import CreatorBillOfRightsModal, {
  BillOfRightsStatement,
  ConsentStatus,
  CreatorBillOfRightsModalProps,
} from '../../../src/components/modals/CreatorBillOfRightsModal';

// Mock Lucide React icons
jest.mock('lucide-react', () => ({
  X: () => <div data-testid="x-icon">X</div>,
  Check: () => <div data-testid="check-icon">✓</div>,
  AlertCircle: () => <div data-testid="alert-circle-icon">!</div>,
}));

// Test data
const mockStatements: BillOfRightsStatement[] = [
  {
    id: 'content-ownership',
    title: 'Content Ownership',
    content: 'I understand that I retain ownership of all original content I create.',
    required: true,
  },
  {
    id: 'fair-compensation',
    title: 'Fair Compensation',
    content: 'I acknowledge the platform\'s commitment to transparent revenue sharing.',
    required: true,
  },
  {
    id: 'optional-marketing',
    title: 'Marketing Communications',
    content: 'I agree to receive marketing communications (optional).',
    required: false,
  },
];

// Default props
const defaultProps: CreatorBillOfRightsModalProps = {
  isOpen: true,
  onClose: jest.fn(),
  onConsentComplete: jest.fn(),
  statements: mockStatements,
  isSubmitting: false,
};

describe('CreatorBillOfRightsModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Reset focus
    document.body.focus();
  });

  describe('Rendering', () => {
    it('renders when open', () => {
      render(<CreatorBillOfRightsModal {...defaultProps} />);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Creator\'s Bill of Rights')).toBeInTheDocument();
      expect(screen.getByText('Please review and acknowledge each statement below')).toBeInTheDocument();
    });

    it('does not render when closed', () => {
      render(<CreatorBillOfRightsModal {...defaultProps} isOpen={false} />);

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('renders all provided statements', () => {
      render(<CreatorBillOfRightsModal {...defaultProps} />);

      mockStatements.forEach(statement => {
        expect(screen.getByText(statement.title)).toBeInTheDocument();
        expect(screen.getByText(statement.content)).toBeInTheDocument();
      });
    });

    it('shows required indicators for required statements', () => {
      render(<CreatorBillOfRightsModal {...defaultProps} />);

      const requiredStatements = mockStatements.filter(s => s.required);
      const optionalStatements = mockStatements.filter(s => !s.required);

      // Required statements should have asterisk
      expect(screen.getAllByText('*')).toHaveLength(requiredStatements.length);

      // Optional statements should not
      optionalStatements.forEach(statement => {
        const label = screen.getByText(statement.title);
        expect(label.parentElement).not.toHaveTextContent('*');
      });
    });

    it('displays progress counter', () => {
      render(<CreatorBillOfRightsModal {...defaultProps} />);

      const requiredCount = mockStatements.filter(s => s.required).length;
      expect(screen.getByText(`0 of ${requiredCount} required statements acknowledged`)).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has proper ARIA attributes', () => {
      render(<CreatorBillOfRightsModal {...defaultProps} />);

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(dialog).toHaveAttribute('aria-labelledby');
      expect(dialog).toHaveAttribute('aria-describedby');
    });

    it('focuses first checkbox on open', async () => {
      render(<CreatorBillOfRightsModal {...defaultProps} />);

      await waitFor(() => {
        const firstCheckbox = screen.getByRole('checkbox', { name: /content ownership/i });
        expect(firstCheckbox).toHaveFocus();
      });
    });

    it('traps focus within modal', async () => {
      const user = userEvent.setup();
      render(<CreatorBillOfRightsModal {...defaultProps} />);

      const checkboxes = screen.getAllByRole('checkbox');
      const buttons = screen.getAllByRole('button');
      const lastElement = buttons[buttons.length - 1];

      // Focus should be trapped - tabbing from last element goes to first
      await user.tab({ shift: true });
      lastElement.focus();
      await user.tab();

      expect(checkboxes[0]).toHaveFocus();
    });

    it('closes on Escape key', async () => {
      const user = userEvent.setup();
      const onClose = jest.fn();

      render(<CreatorBillOfRightsModal {...defaultProps} onClose={onClose} />);

      await user.keyboard('{Escape}');
      expect(onClose).toHaveBeenCalled();
    });

    it('has proper checkbox labeling', () => {
      render(<CreatorBillOfRightsModal {...defaultProps} />);

      mockStatements.forEach(statement => {
        const checkbox = screen.getByRole('checkbox', { name: new RegExp(statement.title, 'i') });
        expect(checkbox).toHaveAttribute('aria-describedby', `description-${statement.id}`);
        expect(checkbox).toHaveAttribute('aria-required', statement.required.toString());
      });
    });
  });

  describe('Consent Management', () => {
    it('updates consent status when checkbox is clicked', async () => {
      const user = userEvent.setup();
      render(<CreatorBillOfRightsModal {...defaultProps} />);

      const checkbox = screen.getByRole('checkbox', { name: /content ownership/i });
      expect(checkbox).not.toBeChecked();

      await user.click(checkbox);
      expect(checkbox).toBeChecked();

      // Should show acknowledgment indicator
      expect(screen.getByText('Acknowledged')).toBeInTheDocument();
    });

    it('updates progress counter as consents are given', async () => {
      const user = userEvent.setup();
      render(<CreatorBillOfRightsModal {...defaultProps} />);

      const requiredCount = mockStatements.filter(s => s.required).length;

      // Initially 0 of N
      expect(screen.getByText(`0 of ${requiredCount} required statements acknowledged`)).toBeInTheDocument();

      // Click first required checkbox
      const firstCheckbox = screen.getByRole('checkbox', { name: /content ownership/i });
      await user.click(firstCheckbox);

      // Should be 1 of N
      expect(screen.getByText(`1 of ${requiredCount} required statements acknowledged`)).toBeInTheDocument();
    });

    it('shows "All statements acknowledged" when complete', async () => {
      const user = userEvent.setup();
      render(<CreatorBillOfRightsModal {...defaultProps} />);

      // Click all required checkboxes
      for (const statement of mockStatements.filter(s => s.required)) {
        const checkbox = screen.getByRole('checkbox', { name: new RegExp(statement.title, 'i') });
        await user.click(checkbox);
      }

      expect(screen.getByText('All statements acknowledged')).toBeInTheDocument();
    });

    it('enables continue button only when all required consents are given', async () => {
      const user = userEvent.setup();
      render(<CreatorBillOfRightsModal {...defaultProps} />);

      const continueButton = screen.getByRole('button', { name: /continue to sign up/i });
      expect(continueButton).toBeDisabled();

      // Click all required checkboxes
      for (const statement of mockStatements.filter(s => s.required)) {
        const checkbox = screen.getByRole('checkbox', { name: new RegExp(statement.title, 'i') });
        await user.click(checkbox);
      }

      expect(continueButton).toBeEnabled();
    });
  });

  describe('Form Submission', () => {
    it('calls onConsentComplete with consent data when submitted', async () => {
      const user = userEvent.setup();
      const onConsentComplete = jest.fn();

      render(<CreatorBillOfRightsModal {...defaultProps} onConsentComplete={onConsentComplete} />);

      // Click all required checkboxes
      for (const statement of mockStatements.filter(s => s.required)) {
        const checkbox = screen.getByRole('checkbox', { name: new RegExp(statement.title, 'i') });
        await user.click(checkbox);
      }

      const continueButton = screen.getByRole('button', { name: /continue to sign up/i });
      await user.click(continueButton);

      expect(onConsentComplete).toHaveBeenCalledWith({
        'content-ownership': true,
        'fair-compensation': true,
      });
    });

    it('shows errors when submitted without all required consents', async () => {
      const user = userEvent.setup();
      render(<CreatorBillOfRightsModal {...defaultProps} />);

      // Click continue without all required consents
      const continueButton = screen.getByRole('button', { name: /continue to sign up/i });
      await user.click(continueButton);

      // Should show error message
      expect(screen.getByText('Please acknowledge all required statements:')).toBeInTheDocument();
      expect(screen.getByText('"Content Ownership" requires consent')).toBeInTheDocument();
      expect(screen.getByText('"Fair Compensation" requires consent')).toBeInTheDocument();
    });

    it('focuses first missing consent when submission fails', async () => {
      const user = userEvent.setup();
      render(<CreatorBillOfRightsModal {...defaultProps} />);

      // Click second checkbox but not first
      const secondCheckbox = screen.getByRole('checkbox', { name: /fair compensation/i });
      await user.click(secondCheckbox);

      const continueButton = screen.getByRole('button', { name: /continue to sign up/i });
      await user.click(continueButton);

      // Should focus first missing checkbox
      const firstCheckbox = screen.getByRole('checkbox', { name: /content ownership/i });
      expect(firstCheckbox).toHaveFocus();
    });
  });

  describe('Loading States', () => {
    it('shows loading state when submitting', () => {
      render(<CreatorBillOfRightsModal {...defaultProps} isSubmitting={true} />);

      expect(screen.getByText('Processing...')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /continue to sign up/i })).toBeDisabled();
      expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled();
    });

    it('shows spinner during submission', () => {
      render(<CreatorBillOfRightsModal {...defaultProps} isSubmitting={true} />);

      // Look for spinner SVG
      const spinner = screen.getByRole('button', { name: /continue to sign up/i }).querySelector('svg');
      expect(spinner).toHaveClass('animate-spin');
    });
  });

  describe('Modal Controls', () => {
    it('closes when backdrop is clicked', async () => {
      const user = userEvent.setup();
      const onClose = jest.fn();

      render(<CreatorBillOfRightsModal {...defaultProps} onClose={onClose} />);

      // Click backdrop (the fixed overlay)
      const backdrop = document.querySelector('.fixed.inset-0.bg-black');
      if (backdrop) {
        await user.click(backdrop);
        expect(onClose).toHaveBeenCalled();
      }
    });

    it('closes when X button is clicked', async () => {
      const user = userEvent.setup();
      const onClose = jest.fn();

      render(<CreatorBillOfRightsModal {...defaultProps} onClose={onClose} />);

      const closeButton = screen.getByRole('button', { name: /close modal/i });
      await user.click(closeButton);

      expect(onClose).toHaveBeenCalled();
    });

    it('closes when Cancel button is clicked', async () => {
      const user = userEvent.setup();
      const onClose = jest.fn();

      render(<CreatorBillOfRightsModal {...defaultProps} onClose={onClose} />);

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      await user.click(cancelButton);

      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('Visual States', () => {
    it('applies checked styling to acknowledged statements', async () => {
      const user = userEvent.setup();
      render(<CreatorBillOfRightsModal {...defaultProps} />);

      const statement = screen.getByText('Content Ownership').closest('div');
      expect(statement).toHaveClass('border-gray-200', 'bg-gray-50');

      const checkbox = screen.getByRole('checkbox', { name: /content ownership/i });
      await user.click(checkbox);

      expect(statement).toHaveClass('border-green-200', 'bg-green-50');
    });

    it('shows focus styling when statement is focused', async () => {
      const user = userEvent.setup();
      render(<CreatorBillOfRightsModal {...defaultProps} />);

      const checkbox = screen.getByRole('checkbox', { name: /content ownership/i });
      await user.tab();

      const statement = checkbox.closest('div');
      expect(statement).toHaveClass('ring-2', 'ring-blue-500');
    });
  });

  describe('Edge Cases', () => {
    it('handles empty statements array', () => {
      render(<CreatorBillOfRightsModal {...defaultProps} statements={[]} />);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('0 of 0 required statements acknowledged')).toBeInTheDocument();
    });

    it('handles statements with only optional items', async () => {
      const user = userEvent.setup();
      const optionalStatements = [
        {
          id: 'optional-1',
          title: 'Optional Statement',
          content: 'This is optional.',
          required: false,
        },
      ];

      render(<CreatorBillOfRightsModal {...defaultProps} statements={optionalStatements} />);

      const continueButton = screen.getByRole('button', { name: /continue to sign up/i });
      expect(continueButton).toBeEnabled(); // Should be enabled with no required statements

      await user.click(continueButton);
      expect(defaultProps.onConsentComplete).toHaveBeenCalled();
    });

    it('maintains state when modal is reopened', async () => {
      const user = userEvent.setup();
      const { rerender } = render(<CreatorBillOfRightsModal {...defaultProps} />);

      // Check a box
      const checkbox = screen.getByRole('checkbox', { name: /content ownership/i });
      await user.click(checkbox);

      // Close modal
      rerender(<CreatorBillOfRightsModal {...defaultProps} isOpen={false} />);

      // Reopen modal
      rerender(<CreatorBillOfRightsModal {...defaultProps} isOpen={true} />);

      // State should be preserved
      const newCheckbox = screen.getByRole('checkbox', { name: /content ownership/i });
      expect(newCheckbox).toBeChecked();
    });
  });
});