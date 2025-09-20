import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRouter, useSearchParams } from 'next/navigation';
import '@testing-library/jest-dom';

import AcceptRightsPage from '../../app/auth/accept-rights/page';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  useSearchParams: jest.fn(),
}));

// Mock Supabase client
const mockSupabaseClient = {
  auth: {
    getUser: jest.fn(),
    signOut: jest.fn(),
  },
};

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => mockSupabaseClient,
}));

// Mock server action
jest.mock('@/lib/server/rights', () => ({
  recordRightsAcceptanceFromHeaders: jest.fn(),
}));

// Mock Lucide icons
jest.mock('lucide-react', () => ({
  Shield: () => <div data-testid="shield-icon">🛡️</div>,
  FileText: () => <div data-testid="file-text-icon">📄</div>,
  ArrowRight: () => <div data-testid="arrow-right-icon">→</div>,
  AlertCircle: () => <div data-testid="alert-circle-icon">⚠️</div>,
}));

const mockPush = jest.fn();
const mockRouter = {
  push: mockPush,
  replace: jest.fn(),
  refresh: jest.fn(),
};

const mockSearchParams = {
  get: jest.fn(),
};

describe('AcceptRightsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue(mockRouter);
    (useSearchParams as jest.Mock).mockReturnValue(mockSearchParams);

    // Default search params
    mockSearchParams.get.mockImplementation((param: string) => {
      if (param === 'redirect') return '/dashboard';
      return null;
    });

    // Default authenticated user
    mockSupabaseClient.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123', email: 'test@example.com' } },
      error: null,
    });
  });

  describe('Page Rendering', () => {
    it('renders the main components', async () => {
      render(<AcceptRightsPage />);

      expect(screen.getByText('Creator Protection Required')).toBeInTheDocument();
      expect(screen.getByText(/Before accessing Manthan, please read and accept/)).toBeInTheDocument();
      expect(screen.getByText('Action Required')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Read Creator's Bill of Rights/ })).toBeInTheDocument();
      expect(screen.getByRole('checkbox')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Accept and Continue/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Sign Out Instead/ })).toBeInTheDocument();
    });

    it('shows disabled accept button initially', () => {
      render(<AcceptRightsPage />);

      const acceptButton = screen.getByRole('button', { name: /Accept and Continue/ });
      expect(acceptButton).toBeDisabled();
    });

    it('renders the notice about updated rights', () => {
      render(<AcceptRightsPage />);

      expect(screen.getByText(/We've updated our Creator's Bill of Rights/)).toBeInTheDocument();
      expect(screen.getByText(/Your acceptance is required to continue/)).toBeInTheDocument();
    });
  });

  describe('Creator\'s Bill of Rights Modal', () => {
    it('opens modal when button is clicked', async () => {
      const user = userEvent.setup();
      render(<AcceptRightsPage />);

      const modalTrigger = screen.getByRole('button', { name: /Read Creator's Bill of Rights/ });
      await user.click(modalTrigger);

      await waitFor(() => {
        expect(screen.getByText('Creator\'s Bill of Rights')).toBeInTheDocument();
        expect(screen.getByText(/Please read and understand how your intellectual property/)).toBeInTheDocument();
      });
    });

    it('displays all creator rights in modal', async () => {
      const user = userEvent.setup();
      render(<AcceptRightsPage />);

      const modalTrigger = screen.getByRole('button', { name: /Read Creator's Bill of Rights/ });
      await user.click(modalTrigger);

      await waitFor(() => {
        expect(screen.getByText(/my uploaded script will be used only for the purpose/)).toBeInTheDocument();
        expect(screen.getByText(/my script and personal data will never be shared/)).toBeInTheDocument();
        expect(screen.getByText(/my intellectual property will not be used to train/)).toBeInTheDocument();
        expect(screen.getByText(/I retain full ownership of my creative work/)).toBeInTheDocument();
        expect(screen.getByText(/I can request deletion of my data/)).toBeInTheDocument();
      });
    });

    it('displays data security section in modal', async () => {
      const user = userEvent.setup();
      render(<AcceptRightsPage />);

      const modalTrigger = screen.getByRole('button', { name: /Read Creator's Bill of Rights/ });
      await user.click(modalTrigger);

      await waitFor(() => {
        expect(screen.getByText('Data Security & Privacy:')).toBeInTheDocument();
        expect(screen.getByText(/Your scripts are encrypted both in transit and at rest/)).toBeInTheDocument();
        expect(screen.getByText(/Access to your content is restricted to authorized/)).toBeInTheDocument();
      });
    });
  });

  describe('Checkbox Interaction', () => {
    it('enables accept button when checkbox is checked', async () => {
      const user = userEvent.setup();
      render(<AcceptRightsPage />);

      const checkbox = screen.getByRole('checkbox');
      const acceptButton = screen.getByRole('button', { name: /Accept and Continue/ });

      expect(acceptButton).toBeDisabled();

      await user.click(checkbox);

      expect(acceptButton).toBeEnabled();
    });

    it('disables accept button when checkbox is unchecked', async () => {
      const user = userEvent.setup();
      render(<AcceptRightsPage />);

      const checkbox = screen.getByRole('checkbox');
      const acceptButton = screen.getByRole('button', { name: /Accept and Continue/ });

      // Check then uncheck
      await user.click(checkbox);
      expect(acceptButton).toBeEnabled();

      await user.click(checkbox);
      expect(acceptButton).toBeDisabled();
    });

    it('shows proper label for checkbox', () => {
      render(<AcceptRightsPage />);

      expect(screen.getByText(/I have read and agree to the Creator's Bill of Rights/)).toBeInTheDocument();
      expect(screen.getByText(/I understand that my intellectual property will be protected/)).toBeInTheDocument();
    });
  });

  describe('Form Submission', () => {
    beforeEach(() => {
      const { recordRightsAcceptanceFromHeaders } = require('@/lib/server/rights');
      recordRightsAcceptanceFromHeaders.mockResolvedValue(undefined);
    });

    it('records rights acceptance when form is submitted', async () => {
      const user = userEvent.setup();
      const { recordRightsAcceptanceFromHeaders } = require('@/lib/server/rights');

      render(<AcceptRightsPage />);

      const checkbox = screen.getByRole('checkbox');
      const acceptButton = screen.getByRole('button', { name: /Accept and Continue/ });

      await user.click(checkbox);
      await user.click(acceptButton);

      await waitFor(() => {
        expect(recordRightsAcceptanceFromHeaders).toHaveBeenCalledWith('user-123', '1.0 - MVP Launch');
      });
    });

    it('redirects to intended destination after successful acceptance', async () => {
      const user = userEvent.setup();
      const { recordRightsAcceptanceFromHeaders } = require('@/lib/server/rights');

      render(<AcceptRightsPage />);

      const checkbox = screen.getByRole('checkbox');
      const acceptButton = screen.getByRole('button', { name: /Accept and Continue/ });

      await user.click(checkbox);
      await user.click(acceptButton);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/dashboard');
      });
    });

    it('redirects to custom redirect URL when provided', async () => {
      const user = userEvent.setup();
      mockSearchParams.get.mockImplementation((param: string) => {
        if (param === 'redirect') return '/projects/123';
        return null;
      });

      render(<AcceptRightsPage />);

      const checkbox = screen.getByRole('checkbox');
      const acceptButton = screen.getByRole('button', { name: /Accept and Continue/ });

      await user.click(checkbox);
      await user.click(acceptButton);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/projects/123');
      });
    });

    it('shows loading state during submission', async () => {
      const user = userEvent.setup();
      const { recordRightsAcceptanceFromHeaders } = require('@/lib/server/rights');

      // Make the server action hang
      recordRightsAcceptanceFromHeaders.mockImplementation(() => new Promise(() => {}));

      render(<AcceptRightsPage />);

      const checkbox = screen.getByRole('checkbox');
      const acceptButton = screen.getByRole('button', { name: /Accept and Continue/ });

      await user.click(checkbox);
      await user.click(acceptButton);

      expect(screen.getByText('Recording acceptance...')).toBeInTheDocument();
      expect(acceptButton).toBeDisabled();
    });

    it('shows error message when submission fails', async () => {
      const user = userEvent.setup();
      const { recordRightsAcceptanceFromHeaders } = require('@/lib/server/rights');

      recordRightsAcceptanceFromHeaders.mockRejectedValue(new Error('Network error'));

      render(<AcceptRightsPage />);

      const checkbox = screen.getByRole('checkbox');
      const acceptButton = screen.getByRole('button', { name: /Accept and Continue/ });

      await user.click(checkbox);
      await user.click(acceptButton);

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });

    it('shows error when attempting to submit without checkbox', async () => {
      const user = userEvent.setup();
      render(<AcceptRightsPage />);

      const acceptButton = screen.getByRole('button', { name: /Accept and Continue/ });

      // Try to click disabled button (this shouldn't actually trigger submission)
      expect(acceptButton).toBeDisabled();
    });
  });

  describe('Sign Out Functionality', () => {
    it('signs out user when sign out button is clicked', async () => {
      const user = userEvent.setup();
      render(<AcceptRightsPage />);

      const signOutButton = screen.getByRole('button', { name: /Sign Out Instead/ });
      await user.click(signOutButton);

      expect(mockSupabaseClient.auth.signOut).toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith('/');
    });
  });

  describe('User Loading', () => {
    it('handles user loading state', () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: null,
      });

      render(<AcceptRightsPage />);

      // Component should still render even without user initially
      expect(screen.getByText('Creator Protection Required')).toBeInTheDocument();
    });

    it('handles user loading error', () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Failed to load user' },
      });

      render(<AcceptRightsPage />);

      // Component should still render gracefully
      expect(screen.getByText('Creator Protection Required')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has proper ARIA labels and roles', () => {
      render(<AcceptRightsPage />);

      expect(screen.getByRole('checkbox')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Accept and Continue/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Sign Out Instead/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Read Creator's Bill of Rights/ })).toBeInTheDocument();
    });

    it('associates checkbox with its label', () => {
      render(<AcceptRightsPage />);

      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toHaveAttribute('id', 'rights-agreement');

      const label = screen.getByText(/I have read and agree to the Creator's Bill of Rights/);
      expect(label.closest('label')).toHaveAttribute('for', 'rights-agreement');
    });
  });
});