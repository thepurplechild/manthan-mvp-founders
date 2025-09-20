import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, Check, AlertCircle } from 'lucide-react';

// TypeScript interfaces
export interface BillOfRightsStatement {
  id: string;
  title: string;
  content: string;
  required: boolean;
}

export interface ConsentStatus {
  [statementId: string]: boolean;
}

export interface CreatorBillOfRightsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConsentComplete: (consents: ConsentStatus) => void;
  statements?: BillOfRightsStatement[];
  className?: string;
  isSubmitting?: boolean;
}

// Default Creator's Bill of Rights statements
const DEFAULT_STATEMENTS: BillOfRightsStatement[] = [
  {
    id: 'content-ownership',
    title: 'Content Ownership',
    content: 'I understand that I retain ownership of all original content I create and upload to this platform.',
    required: true,
  },
  {
    id: 'fair-compensation',
    title: 'Fair Compensation',
    content: 'I acknowledge the platform\'s commitment to transparent revenue sharing and fair compensation structures.',
    required: true,
  },
  {
    id: 'creative-freedom',
    title: 'Creative Freedom',
    content: 'I understand my right to creative expression within the platform\'s community guidelines.',
    required: true,
  },
  {
    id: 'data-privacy',
    title: 'Data Privacy',
    content: 'I acknowledge my rights regarding personal data collection, usage, and deletion as outlined in the Privacy Policy.',
    required: true,
  },
  {
    id: 'platform-changes',
    title: 'Platform Changes',
    content: 'I understand I will be notified of significant platform policy changes that may affect my content or earnings.',
    required: true,
  },
  {
    id: 'content-removal',
    title: 'Content Removal',
    content: 'I acknowledge the platform\'s content moderation policies and my right to appeal content decisions.',
    required: true,
  },
];

export const CreatorBillOfRightsModal: React.FC<CreatorBillOfRightsModalProps> = ({
  isOpen,
  onClose,
  onConsentComplete,
  statements = DEFAULT_STATEMENTS,
  className = '',
  isSubmitting = false,
}) => {
  // State management
  const [consentStatus, setConsentStatus] = useState<ConsentStatus>({});
  const [allConsentsGiven, setAllConsentsGiven] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [focusedStatement, setFocusedStatement] = useState<string | null>(null);

  // Refs for accessibility
  const modalRef = useRef<HTMLDivElement>(null);
  const firstCheckboxRef = useRef<HTMLInputElement>(null);
  const lastElementRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Calculate consent completion status
  useEffect(() => {
    const requiredStatements = statements.filter(stmt => stmt.required);
    const requiredConsents = requiredStatements.every(stmt => consentStatus[stmt.id]);
    setAllConsentsGiven(requiredConsents);

    // Clear errors when all consents are given
    if (requiredConsents) {
      setErrors([]);
    }
  }, [consentStatus, statements]);

  // Handle focus management for accessibility
  useEffect(() => {
    if (isOpen) {
      // Store previous focus
      previousFocusRef.current = document.activeElement as HTMLElement;

      // Focus first checkbox when modal opens
      setTimeout(() => {
        firstCheckboxRef.current?.focus();
      }, 100);
    } else {
      // Restore previous focus when modal closes
      previousFocusRef.current?.focus();
    }

    // Cleanup function
    return () => {
      if (!isOpen && previousFocusRef.current) {
        previousFocusRef.current.focus();
      }
    };
  }, [isOpen]);

  // Handle checkbox change
  const handleConsentChange = useCallback((statementId: string, checked: boolean) => {
    setConsentStatus(prev => ({
      ...prev,
      [statementId]: checked,
    }));
  }, []);

  // Handle form submission
  const handleSubmit = useCallback(() => {
    const requiredStatements = statements.filter(stmt => stmt.required);
    const missingConsents = requiredStatements.filter(stmt => !consentStatus[stmt.id]);

    if (missingConsents.length > 0) {
      const errorMessages = missingConsents.map(stmt => `"${stmt.title}" requires consent`);
      setErrors(errorMessages);

      // Focus first missing consent
      const firstMissingElement = document.getElementById(`checkbox-${missingConsents[0].id}`);
      firstMissingElement?.focus();
      return;
    }

    setErrors([]);
    onConsentComplete(consentStatus);
  }, [consentStatus, statements, onConsentComplete]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      onClose();
    } else if (event.key === 'Tab') {
      // Handle focus trapping
      const focusableElements = modalRef.current?.querySelectorAll(
        'input, button, [tabindex]:not([tabindex="-1"])'
      );

      if (focusableElements) {
        const firstElement = focusableElements[0] as HTMLElement;
        const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

        if (event.shiftKey && document.activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
        } else if (!event.shiftKey && document.activeElement === lastElement) {
          event.preventDefault();
          firstElement.focus();
        }
      }
    }
  }, [onClose]);

  // Don't render if not open
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      aria-describedby="modal-description"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal container */}
      <div className="flex min-h-full items-center justify-center p-4 sm:p-6 lg:p-8">
        <div
          ref={modalRef}
          className={`
            relative transform overflow-hidden rounded-lg bg-white shadow-xl transition-all
            w-full max-w-2xl mx-auto
            ${className}
          `}
          onKeyDown={handleKeyDown}
        >
          {/* Header */}
          <div className="bg-white px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h3
                id="modal-title"
                className="text-xl font-semibold text-gray-900"
              >
                Creator's Bill of Rights
              </h3>
              <button
                type="button"
                className="
                  text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2
                  focus:ring-blue-500 focus:ring-offset-2 rounded-md p-1
                "
                onClick={onClose}
                aria-label="Close modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p
              id="modal-description"
              className="mt-2 text-sm text-gray-600"
            >
              Please review and acknowledge each statement below to continue with your registration.
              All statements are required for account creation.
            </p>
          </div>

          {/* Content */}
          <div className="max-h-96 overflow-y-auto px-6 py-4">
            {/* Error messages */}
            {errors.length > 0 && (
              <div
                className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md"
                role="alert"
                aria-live="polite"
              >
                <div className="flex">
                  <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0" />
                  <div className="ml-3">
                    <h4 className="text-sm font-medium text-red-800">
                      Please acknowledge all required statements:
                    </h4>
                    <ul className="mt-2 text-sm text-red-700 list-disc list-inside">
                      {errors.map((error, index) => (
                        <li key={index}>{error}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {/* Statements list */}
            <div className="space-y-6">
              {statements.map((statement, index) => {
                const isChecked = consentStatus[statement.id] || false;
                const isFirst = index === 0;
                const isFocused = focusedStatement === statement.id;

                return (
                  <div
                    key={statement.id}
                    className={`
                      p-4 border rounded-lg transition-colors
                      ${isChecked ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50'}
                      ${isFocused ? 'ring-2 ring-blue-500 ring-opacity-50' : ''}
                    `}
                  >
                    <div className="flex items-start space-x-3">
                      <div className="flex-shrink-0 pt-1">
                        <input
                          ref={isFirst ? firstCheckboxRef : undefined}
                          id={`checkbox-${statement.id}`}
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => handleConsentChange(statement.id, e.target.checked)}
                          onFocus={() => setFocusedStatement(statement.id)}
                          onBlur={() => setFocusedStatement(null)}
                          className="
                            h-4 w-4 text-blue-600 border-gray-300 rounded
                            focus:ring-blue-500 focus:ring-2 focus:ring-offset-2
                            transition-colors cursor-pointer
                          "
                          aria-describedby={`description-${statement.id}`}
                          aria-required={statement.required}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <label
                          htmlFor={`checkbox-${statement.id}`}
                          className="block text-sm font-medium text-gray-900 cursor-pointer"
                        >
                          {statement.title}
                          {statement.required && (
                            <span className="text-red-500 ml-1" aria-label="required">*</span>
                          )}
                        </label>
                        <p
                          id={`description-${statement.id}`}
                          className="mt-1 text-sm text-gray-600 leading-relaxed"
                        >
                          {statement.content}
                        </p>
                        {isChecked && (
                          <div className="mt-2 flex items-center text-green-600">
                            <Check className="h-4 w-4 mr-1" />
                            <span className="text-sm font-medium">Acknowledged</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer */}
          <div className="bg-gray-50 px-6 py-4 border-t border-gray-200">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600">
                {allConsentsGiven ? (
                  <span className="text-green-600 font-medium flex items-center">
                    <Check className="h-4 w-4 mr-1" />
                    All statements acknowledged
                  </span>
                ) : (
                  <span>
                    {Object.values(consentStatus).filter(Boolean).length} of {statements.filter(s => s.required).length} required statements acknowledged
                  </span>
                )}
              </div>

              <div className="flex space-x-3">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="
                    inline-flex justify-center rounded-md border border-gray-300 bg-white
                    px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50
                    focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                    disabled:opacity-50 disabled:cursor-not-allowed transition-colors
                  "
                >
                  Cancel
                </button>
                <button
                  ref={lastElementRef}
                  type="button"
                  onClick={handleSubmit}
                  disabled={!allConsentsGiven || isSubmitting}
                  className={`
                    inline-flex justify-center rounded-md border border-transparent
                    px-4 py-2 text-sm font-medium text-white shadow-sm
                    focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                    transition-colors
                    ${allConsentsGiven && !isSubmitting
                      ? 'bg-blue-600 hover:bg-blue-700'
                      : 'bg-gray-300 cursor-not-allowed'
                    }
                  `}
                  aria-label={allConsentsGiven ? 'Continue with registration' : 'Complete all acknowledgments to continue'}
                >
                  {isSubmitting ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Processing...
                    </>
                  ) : (
                    'Continue to Sign Up'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreatorBillOfRightsModal;