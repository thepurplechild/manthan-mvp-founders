import { renderHook, act } from '@testing-library/react';
import { useConsent, useConsentFormIntegration } from '../../src/hooks/useConsent';
import { BillOfRightsStatement } from '../../src/components/modals/CreatorBillOfRightsModal';

const mockStatements: BillOfRightsStatement[] = [
  {
    id: 'content-ownership',
    title: 'Content Ownership',
    content: 'I understand that I retain ownership of all original content.',
    required: true,
  },
  {
    id: 'fair-compensation',
    title: 'Fair Compensation',
    content: 'I acknowledge transparent revenue sharing.',
    required: true,
  },
  {
    id: 'optional-marketing',
    title: 'Marketing Communications',
    content: 'I agree to receive marketing communications.',
    required: false,
  },
];

describe('useConsent', () => {
  describe('Basic Functionality', () => {
    it('initializes with empty consent status', () => {
      const { result } = renderHook(() => useConsent());

      expect(result.current.consentStatus).toEqual({});
      expect(result.current.isConsentComplete).toBe(false);
      expect(result.current.isConsentModalOpen).toBe(false);
    });

    it('updates individual consents', () => {
      const { result } = renderHook(() => useConsent());

      act(() => {
        result.current.updateConsent('content-ownership', true);
      });

      expect(result.current.consentStatus).toEqual({
        'content-ownership': true,
      });
    });

    it('sets complete consent status', () => {
      const { result } = renderHook(() => useConsent());

      const consents = {
        'content-ownership': true,
        'fair-compensation': true,
      };

      act(() => {
        result.current.setConsentStatus(consents);
      });

      expect(result.current.consentStatus).toEqual(consents);
    });

    it('clears all consents', () => {
      const { result } = renderHook(() => useConsent());

      // Set some consents first
      act(() => {
        result.current.setConsentStatus({
          'content-ownership': true,
          'fair-compensation': true,
        });
      });

      // Clear them
      act(() => {
        result.current.clearConsents();
      });

      expect(result.current.consentStatus).toEqual({});
    });
  });

  describe('Modal State Management', () => {
    it('opens and closes consent modal', () => {
      const { result } = renderHook(() => useConsent());

      expect(result.current.isConsentModalOpen).toBe(false);

      act(() => {
        result.current.openConsentModal();
      });

      expect(result.current.isConsentModalOpen).toBe(true);

      act(() => {
        result.current.closeConsentModal();
      });

      expect(result.current.isConsentModalOpen).toBe(false);
    });
  });

  describe('Consent Validation', () => {
    it('validates consents against required statements', () => {
      const { result } = renderHook(() => useConsent());

      // Initially invalid
      const initialValidation = result.current.validateConsents(mockStatements);
      expect(initialValidation.isValid).toBe(false);
      expect(initialValidation.missingConsents).toEqual(['content-ownership', 'fair-compensation']);
      expect(initialValidation.errors).toHaveLength(2);

      // Add one consent
      act(() => {
        result.current.updateConsent('content-ownership', true);
      });

      const partialValidation = result.current.validateConsents(mockStatements);
      expect(partialValidation.isValid).toBe(false);
      expect(partialValidation.missingConsents).toEqual(['fair-compensation']);
      expect(partialValidation.errors).toHaveLength(1);

      // Add all required consents
      act(() => {
        result.current.updateConsent('fair-compensation', true);
      });

      const completeValidation = result.current.validateConsents(mockStatements);
      expect(completeValidation.isValid).toBe(true);
      expect(completeValidation.missingConsents).toEqual([]);
      expect(completeValidation.errors).toHaveLength(0);
    });

    it('handles optional statements correctly', () => {
      const { result } = renderHook(() => useConsent());

      // Add only required consents
      act(() => {
        result.current.setConsentStatus({
          'content-ownership': true,
          'fair-compensation': true,
        });
      });

      const validation = result.current.validateConsents(mockStatements);
      expect(validation.isValid).toBe(true);
      expect(validation.missingConsents).toEqual([]);
    });
  });

  describe('Consent Data Generation', () => {
    it('generates formatted consent data', () => {
      const { result } = renderHook(() => useConsent());

      act(() => {
        result.current.setConsentStatus({
          'content-ownership': true,
          'fair-compensation': true,
        });
      });

      const consentData = result.current.getConsentData();

      expect(consentData).toEqual({
        consents: {
          'content-ownership': true,
          'fair-compensation': true,
        },
        timestamp: expect.any(String),
        version: '1.0',
      });

      // Verify timestamp is valid ISO string
      expect(new Date(consentData.timestamp).toISOString()).toBe(consentData.timestamp);
    });
  });

  describe('isConsentComplete Calculation', () => {
    it('calculates consent completion correctly', () => {
      const { result } = renderHook(() => useConsent());

      // Initially incomplete
      expect(result.current.isConsentComplete).toBe(false);

      // Partial consent (should still be incomplete)
      act(() => {
        result.current.updateConsent('content-ownership', true);
      });

      expect(result.current.isConsentComplete).toBe(false);

      // Complete consent
      act(() => {
        result.current.updateConsent('fair-compensation', true);
      });

      expect(result.current.isConsentComplete).toBe(true);

      // Revoke consent
      act(() => {
        result.current.updateConsent('content-ownership', false);
      });

      expect(result.current.isConsentComplete).toBe(false);
    });
  });
});

describe('useConsentFormIntegration', () => {
  it('integrates with form libraries', () => {
    const mockSetValue = jest.fn();
    const mockTrigger = jest.fn().mockResolvedValue(true);

    const { result } = renderHook(() =>
      useConsentFormIntegration(mockStatements, mockSetValue, mockTrigger)
    );

    // Should include all consent hook functionality
    expect(result.current.consentStatus).toEqual({});
    expect(result.current.isConsentComplete).toBe(false);
    expect(result.current.isConsentModalOpen).toBe(false);

    // Should include form integration
    expect(result.current.handleConsentComplete).toBeInstanceOf(Function);
    expect(result.current.validation).toBeDefined();
  });

  it('handles consent completion with form integration', async () => {
    const mockSetValue = jest.fn();
    const mockTrigger = jest.fn().mockResolvedValue(true);

    const { result } = renderHook(() =>
      useConsentFormIntegration(mockStatements, mockSetValue, mockTrigger)
    );

    const consents = {
      'content-ownership': true,
      'fair-compensation': true,
    };

    await act(async () => {
      result.current.handleConsentComplete(consents);
    });

    // Should update consent status
    expect(result.current.consentStatus).toEqual(consents);

    // Should close modal
    expect(result.current.isConsentModalOpen).toBe(false);

    // Should call form methods
    expect(mockSetValue).toHaveBeenCalledWith('consents', consents);
    expect(mockSetValue).toHaveBeenCalledWith('consentData', expect.objectContaining({
      consents,
      timestamp: expect.any(String),
      version: '1.0',
    }));
    expect(mockTrigger).toHaveBeenCalledWith('consents');
  });

  it('provides validation results', () => {
    const { result } = renderHook(() =>
      useConsentFormIntegration(mockStatements)
    );

    // Initial validation should be invalid
    expect(result.current.validation.isValid).toBe(false);
    expect(result.current.validation.missingConsents).toEqual(['content-ownership', 'fair-compensation']);

    // Update consents
    act(() => {
      result.current.setConsentStatus({
        'content-ownership': true,
        'fair-compensation': true,
      });
    });

    // Validation should now be valid
    expect(result.current.validation.isValid).toBe(true);
    expect(result.current.validation.missingConsents).toEqual([]);
  });

  it('works without form integration parameters', () => {
    const { result } = renderHook(() =>
      useConsentFormIntegration(mockStatements)
    );

    const consents = {
      'content-ownership': true,
      'fair-compensation': true,
    };

    // Should not throw when called without form methods
    expect(() => {
      act(() => {
        result.current.handleConsentComplete(consents);
      });
    }).not.toThrow();

    expect(result.current.consentStatus).toEqual(consents);
  });
});