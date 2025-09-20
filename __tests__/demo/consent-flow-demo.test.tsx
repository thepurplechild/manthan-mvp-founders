import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

// Simple demo components to test the integration flow
const ConsentDemo: React.FC = () => {
  const [hasConsent, setHasConsent] = React.useState(false);
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [formData, setFormData] = React.useState({
    name: '',
    email: '',
    acceptTerms: false,
  });

  const canSubmit = hasConsent && formData.acceptTerms && formData.name && formData.email;

  const handleConsentComplete = () => {
    setHasConsent(true);
    setIsModalOpen(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (canSubmit) {
      // Simulate form submission
      console.log('Form submitted!', { ...formData, hasConsent });
    }
  };

  return (
    <div>
      <h1>Sign Up Demo</h1>

      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="name">Name</label>
          <input
            id="name"
            type="text"
            value={formData.name}
            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
          />
        </div>

        <div>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={formData.email}
            onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
          />
        </div>

        <div>
          <h3>Creator's Bill of Rights</h3>
          <p>Review and acknowledge our creator protection policies</p>
          {hasConsent ? (
            <div>
              <span data-testid="consent-acknowledged">✅ Acknowledged</span>
              <button type="button" onClick={() => setIsModalOpen(true)}>
                View Rights
              </button>
            </div>
          ) : (
            <div>
              <button type="button" onClick={() => setIsModalOpen(true)}>
                Review Rights
              </button>
              <p style={{ color: 'red' }}>
                You must review and acknowledge the Creator's Bill of Rights to continue.
              </p>
            </div>
          )}
        </div>

        <div>
          <label>
            <input
              type="checkbox"
              checked={formData.acceptTerms}
              onChange={(e) => setFormData(prev => ({ ...prev, acceptTerms: e.target.checked }))}
            />
            I accept the Terms and Conditions
          </label>
        </div>

        <button type="submit" disabled={!canSubmit}>
          Create Account
        </button>
      </form>

      {isModalOpen && (
        <div data-testid="consent-modal" role="dialog">
          <h2>Creator's Bill of Rights</h2>
          <div>
            <label>
              <input type="checkbox" id="content-ownership" />
              Content Ownership: I understand that I retain ownership of all original content.
            </label>
          </div>
          <div>
            <label>
              <input type="checkbox" id="fair-compensation" />
              Fair Compensation: I acknowledge transparent revenue sharing.
            </label>
          </div>
          <div>
            <label>
              <input type="checkbox" id="creative-freedom" />
              Creative Freedom: I understand my right to creative expression.
            </label>
          </div>
          <div>
            <label>
              <input type="checkbox" id="data-privacy" />
              Data Privacy: I acknowledge my rights regarding personal data.
            </label>
          </div>
          <div>
            <label>
              <input type="checkbox" id="platform-changes" />
              Platform Changes: I understand I will be notified of policy changes.
            </label>
          </div>
          <div>
            <label>
              <input type="checkbox" id="content-removal" />
              Content Removal: I acknowledge content moderation policies.
            </label>
          </div>
          <div>
            <button onClick={() => setIsModalOpen(false)}>Cancel</button>
            <button onClick={handleConsentComplete}>Continue to Sign Up</button>
          </div>
        </div>
      )}
    </div>
  );
};

describe('Creator\'s Bill of Rights - Sign-Up Flow Integration Demo', () => {
  it('requires consent acknowledgment before enabling submit button', async () => {
    const user = userEvent.setup();
    render(<ConsentDemo />);

    // Fill out basic form
    await user.type(screen.getByLabelText(/name/i), 'Test User');
    await user.type(screen.getByLabelText(/email/i), 'test@example.com');
    await user.click(screen.getByLabelText(/i accept the terms/i));

    // Submit button should be disabled without consent
    const submitButton = screen.getByRole('button', { name: /create account/i });
    expect(submitButton).toBeDisabled();

    // Error message should be shown
    expect(screen.getByText(/you must review and acknowledge the creator's bill of rights/i)).toBeInTheDocument();
  });

  it('enables submit button after completing consent flow', async () => {
    const user = userEvent.setup();
    render(<ConsentDemo />);

    // Fill basic form
    await user.type(screen.getByLabelText(/name/i), 'Test User');
    await user.type(screen.getByLabelText(/email/i), 'test@example.com');
    await user.click(screen.getByLabelText(/i accept the terms/i));

    // Open consent modal
    await user.click(screen.getByRole('button', { name: /review rights/i }));

    // Modal should be open
    const modal = screen.getByRole('dialog');
    expect(modal).toBeInTheDocument();
    expect(modal).toHaveTextContent('Creator\'s Bill of Rights');

    // Complete consent (simulate user checking all boxes and clicking continue)
    await user.click(screen.getByRole('button', { name: /continue to sign up/i }));

    // Modal should close and acknowledgment should be shown
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.getByTestId('consent-acknowledged')).toBeInTheDocument();
    });

    // Submit button should now be enabled
    const submitButton = screen.getByRole('button', { name: /create account/i });
    expect(submitButton).toBeEnabled();
  });

  it('allows reopening consent modal after completion', async () => {
    const user = userEvent.setup();
    render(<ConsentDemo />);

    // Complete consent flow first
    await user.type(screen.getByLabelText(/name/i), 'Test User');
    await user.type(screen.getByLabelText(/email/i), 'test@example.com');
    await user.click(screen.getByLabelText(/i accept the terms/i));
    await user.click(screen.getByRole('button', { name: /review rights/i }));
    await user.click(screen.getByRole('button', { name: /continue to sign up/i }));

    // Should show "View Rights" button
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /view rights/i })).toBeInTheDocument();
    });

    // Clicking should reopen modal
    await user.click(screen.getByRole('button', { name: /view rights/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('maintains form state when consent modal is opened and closed', async () => {
    const user = userEvent.setup();
    render(<ConsentDemo />);

    // Fill form data
    await user.type(screen.getByLabelText(/name/i), 'Persistent User');
    await user.type(screen.getByLabelText(/email/i), 'persistent@example.com');

    // Open and close consent modal without completing
    await user.click(screen.getByRole('button', { name: /review rights/i }));
    await user.click(screen.getByRole('button', { name: /cancel/i }));

    // Form data should be preserved
    expect(screen.getByDisplayValue('Persistent User')).toBeInTheDocument();
    expect(screen.getByDisplayValue('persistent@example.com')).toBeInTheDocument();
  });

  it('shows proper accessibility features', () => {
    render(<ConsentDemo />);

    // Check for proper labeling
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/i accept the terms/i)).toBeInTheDocument();

    // Check for error messaging
    expect(screen.getByText(/you must review and acknowledge/i)).toBeInTheDocument();
  });

  it('validates all form requirements before enabling submission', async () => {
    const user = userEvent.setup();
    render(<ConsentDemo />);

    const submitButton = screen.getByRole('button', { name: /create account/i });

    // Initially disabled
    expect(submitButton).toBeDisabled();

    // Fill name only
    await user.type(screen.getByLabelText(/name/i), 'Test User');
    expect(submitButton).toBeDisabled();

    // Add email
    await user.type(screen.getByLabelText(/email/i), 'test@example.com');
    expect(submitButton).toBeDisabled();

    // Accept terms
    await user.click(screen.getByLabelText(/i accept the terms/i));
    expect(submitButton).toBeDisabled(); // Still need consent

    // Complete consent
    await user.click(screen.getByRole('button', { name: /review rights/i }));
    await user.click(screen.getByRole('button', { name: /continue to sign up/i }));

    // Now should be enabled
    await waitFor(() => {
      expect(submitButton).toBeEnabled();
    });
  });
});