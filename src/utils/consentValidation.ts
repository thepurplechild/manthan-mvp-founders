import { BillOfRightsStatement, ConsentStatus } from '../components/modals/CreatorBillOfRightsModal';

/**
 * Validation utilities for Creator's Bill of Rights consent
 */

export interface ConsentValidationError {
  field: string;
  message: string;
  code: string;
}

export interface ConsentValidationResult {
  isValid: boolean;
  errors: ConsentValidationError[];
  missingRequiredConsents: string[];
  completionPercentage: number;
}

/**
 * Validates consent status against required statements
 */
export const validateConsents = (
  consents: ConsentStatus,
  statements: BillOfRightsStatement[]
): ConsentValidationResult => {
  const errors: ConsentValidationError[] = [];
  const requiredStatements = statements.filter(stmt => stmt.required);
  const missingRequiredConsents: string[] = [];

  // Check each required statement
  for (const statement of requiredStatements) {
    if (!consents[statement.id]) {
      missingRequiredConsents.push(statement.id);
      errors.push({
        field: statement.id,
        message: `"${statement.title}" acknowledgment is required`,
        code: 'CONSENT_REQUIRED',
      });
    }
  }

  // Calculate completion percentage
  const totalRequired = requiredStatements.length;
  const completed = totalRequired - missingRequiredConsents.length;
  const completionPercentage = totalRequired > 0 ? (completed / totalRequired) * 100 : 100;

  return {
    isValid: missingRequiredConsents.length === 0,
    errors,
    missingRequiredConsents,
    completionPercentage,
  };
};

/**
 * Creates validation schema for use with form libraries like Yup or Zod
 */
export const createConsentValidationSchema = (statements: BillOfRightsStatement[]) => {
  const requiredStatements = statements.filter(stmt => stmt.required);

  return {
    consents: {
      required: true,
      validate: (value: ConsentStatus) => {
        const result = validateConsents(value || {}, statements);
        return result.isValid || result.errors.map(err => err.message).join(', ');
      },
    },
    // Additional validation for consent data structure
    consentData: {
      required: true,
      validate: (value: any) => {
        if (!value) return 'Consent data is required';
        if (!value.timestamp) return 'Consent timestamp is required';
        if (!value.version) return 'Consent version is required';
        if (!value.consents) return 'Consent status is required';
        return true;
      },
    },
  };
};

/**
 * Validates consent data format for API submission
 */
export const validateConsentData = (consentData: any): ConsentValidationError[] => {
  const errors: ConsentValidationError[] = [];

  if (!consentData) {
    errors.push({
      field: 'consentData',
      message: 'Consent data is required',
      code: 'CONSENT_DATA_MISSING',
    });
    return errors;
  }

  if (!consentData.consents || typeof consentData.consents !== 'object') {
    errors.push({
      field: 'consentData.consents',
      message: 'Consent status object is required',
      code: 'CONSENT_STATUS_INVALID',
    });
  }

  if (!consentData.timestamp || typeof consentData.timestamp !== 'string') {
    errors.push({
      field: 'consentData.timestamp',
      message: 'Consent timestamp is required',
      code: 'CONSENT_TIMESTAMP_INVALID',
    });
  } else {
    // Validate timestamp format
    const date = new Date(consentData.timestamp);
    if (isNaN(date.getTime())) {
      errors.push({
        field: 'consentData.timestamp',
        message: 'Consent timestamp must be a valid ISO date string',
        code: 'CONSENT_TIMESTAMP_FORMAT_INVALID',
      });
    }
  }

  if (!consentData.version || typeof consentData.version !== 'string') {
    errors.push({
      field: 'consentData.version',
      message: 'Consent version is required',
      code: 'CONSENT_VERSION_INVALID',
    });
  }

  return errors;
};

/**
 * Validates that consent was given recently (within specified timeframe)
 */
export const validateConsentRecency = (
  consentTimestamp: string,
  maxAgeMinutes: number = 30
): boolean => {
  try {
    const consentDate = new Date(consentTimestamp);
    const now = new Date();
    const ageMinutes = (now.getTime() - consentDate.getTime()) / (1000 * 60);
    return ageMinutes <= maxAgeMinutes;
  } catch {
    return false;
  }
};

/**
 * Formats validation errors for display in UI
 */
export const formatValidationErrors = (errors: ConsentValidationError[]): string[] => {
  return errors.map(error => error.message);
};

/**
 * Groups validation errors by field for form display
 */
export const groupErrorsByField = (errors: ConsentValidationError[]): Record<string, string[]> => {
  return errors.reduce((acc, error) => {
    if (!acc[error.field]) {
      acc[error.field] = [];
    }
    acc[error.field].push(error.message);
    return acc;
  }, {} as Record<string, string[]>);
};

/**
 * Validates consent completeness for specific user scenarios
 */
export const validateConsentCompleteness = (
  consents: ConsentStatus,
  statements: BillOfRightsStatement[],
  userType: 'creator' | 'founder' = 'creator'
): ConsentValidationResult => {
  // All users must complete all required consents
  return validateConsents(consents, statements);
};

/**
 * Utility to check if consent modal should be shown
 */
export const shouldShowConsentModal = (
  consents: ConsentStatus,
  statements: BillOfRightsStatement[]
): boolean => {
  const validation = validateConsents(consents, statements);
  return !validation.isValid;
};

/**
 * Creates consent audit trail entry
 */
export const createConsentAuditEntry = (
  consents: ConsentStatus,
  userId?: string,
  additionalData?: Record<string, any>
) => {
  return {
    userId,
    consents,
    timestamp: new Date().toISOString(),
    version: '1.0',
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
    ipAddress: 'client-side', // Would be set server-side
    ...additionalData,
  };
};

/**
 * Default export with all validation utilities
 */
export default {
  validateConsents,
  createConsentValidationSchema,
  validateConsentData,
  validateConsentRecency,
  formatValidationErrors,
  groupErrorsByField,
  validateConsentCompleteness,
  shouldShowConsentModal,
  createConsentAuditEntry,
};