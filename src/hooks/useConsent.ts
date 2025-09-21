import { useState, useCallback, useMemo } from 'react';
import { BillOfRightsStatement, ConsentStatus } from '../components/modals/CreatorBillOfRightsModal';

export interface ConsentValidationResult {
  isValid: boolean;
  errors: string[];
  missingConsents: string[];
}

export interface UseConsentReturn {
  consentStatus: ConsentStatus;
  isConsentComplete: boolean;
  isConsentModalOpen: boolean;
  validationResult: ConsentValidationResult;
  setConsentStatus: (consents: ConsentStatus) => void;
  updateConsent: (statementId: string, granted: boolean) => void;
  clearConsents: () => void;
  openConsentModal: () => void;
  closeConsentModal: () => void;
  validateConsents: (statements: BillOfRightsStatement[]) => ConsentValidationResult;
  getConsentData: () => {
    consents: ConsentStatus;
    timestamp: string;
    version: string;
  };
}

/**
 * Custom hook for managing Creator's Bill of Rights consent state
 * Provides comprehensive consent management including validation and modal state
 */
export const useConsent = (): UseConsentReturn => {
  const [consentStatus, setConsentStatusState] = useState<ConsentStatus>({});
  const [isConsentModalOpen, setIsConsentModalOpen] = useState(false);

  // Calculate if all required consents are complete
  const isConsentComplete = useMemo(() => {
    // Only return true if we have consents and they are all true
    const consentValues = Object.values(consentStatus);
    return consentValues.length > 0 && consentValues.every(consent => consent === true);
  }, [consentStatus]);

  // Validate consents against required statements
  const validateConsents = useCallback((statements: BillOfRightsStatement[]): ConsentValidationResult => {
    const requiredStatements = statements.filter(stmt => stmt.required);
    const missingConsents = requiredStatements
      .filter(stmt => !consentStatus[stmt.id])
      .map(stmt => stmt.id);

    const errors = requiredStatements
      .filter(stmt => !consentStatus[stmt.id])
      .map(stmt => `"${stmt.title}" requires acknowledgment`);

    return {
      isValid: missingConsents.length === 0,
      errors,
      missingConsents,
    };
  }, [consentStatus]);

  // Memoized validation result for current consent status
  const validationResult = useMemo((): ConsentValidationResult => {
    // Default validation - will be overridden when specific statements are provided
    const currentConsents = Object.keys(consentStatus);
    const missingConsents = currentConsents.filter(id => !consentStatus[id]);

    return {
      isValid: missingConsents.length === 0,
      errors: missingConsents.map(id => `Consent for ${id} is required`),
      missingConsents,
    };
  }, [consentStatus]);

  // Set consent status (used when modal completes)
  const setConsentStatus = useCallback((consents: ConsentStatus) => {
    setConsentStatusState(consents);
  }, []);

  // Update individual consent
  const updateConsent = useCallback((statementId: string, granted: boolean) => {
    setConsentStatusState(prev => ({
      ...prev,
      [statementId]: granted,
    }));
  }, []);

  // Clear all consents
  const clearConsents = useCallback(() => {
    setConsentStatusState({});
  }, []);

  // Modal control functions
  const openConsentModal = useCallback(() => {
    setIsConsentModalOpen(true);
  }, []);

  const closeConsentModal = useCallback(() => {
    setIsConsentModalOpen(false);
  }, []);

  // Get formatted consent data for submission
  const getConsentData = useCallback(() => {
    return {
      consents: consentStatus,
      timestamp: new Date().toISOString(),
      version: '1.0', // Version of the Creator's Bill of Rights
    };
  }, [consentStatus]);

  return {
    consentStatus,
    isConsentComplete,
    isConsentModalOpen,
    validationResult,
    setConsentStatus,
    updateConsent,
    clearConsents,
    openConsentModal,
    closeConsentModal,
    validateConsents,
    getConsentData,
  };
};

// Helper hook for integrating with form libraries (like react-hook-form)
export const useConsentFormIntegration = (
  statements: BillOfRightsStatement[],
  setValue?: any, // Use any to be compatible with react-hook-form's setValue
  trigger?: any // Use any to be compatible with react-hook-form's trigger
) => {
  const consent = useConsent();

  const handleConsentComplete = useCallback(
    (consents: ConsentStatus) => {
      consent.setConsentStatus(consents);
      consent.closeConsentModal();

      // Update form field if using react-hook-form or similar
      if (setValue) {
        setValue('consents', consents);
        const consentData = {
          consents,
          timestamp: new Date().toISOString(),
          version: '1.0',
        };
        setValue('consentData', consentData);
      }

      // Trigger validation if using react-hook-form
      if (trigger) {
        trigger('consents');
      }
    },
    [consent, setValue, trigger]
  );

  const validation = useMemo(() => {
    return consent.validateConsents(statements);
  }, [consent, statements]);

  return {
    ...consent,
    handleConsentComplete,
    validation,
  };
};