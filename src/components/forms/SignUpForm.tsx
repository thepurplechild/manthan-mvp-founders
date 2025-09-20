import React, { useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { Eye, EyeOff, User, Mail, Lock, CheckCircle } from 'lucide-react';
import CreatorBillOfRightsModal, {
  BillOfRightsStatement,
  ConsentStatus
} from '../modals/CreatorBillOfRightsModal';
import { useConsentFormIntegration } from '../../hooks/useConsent';
import { validateConsents, validateConsentData } from '../../utils/consentValidation';

// Form data interface
interface SignUpFormData {
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
  role: 'creator' | 'founder';
  acceptTerms: boolean;
  consents?: ConsentStatus;
  consentData?: {
    consents: ConsentStatus;
    timestamp: string;
    version: string;
  };
}

// Props interface
interface SignUpFormProps {
  onSubmit: (data: SignUpFormData) => Promise<void>;
  isLoading?: boolean;
  className?: string;
}

// Default Creator's Bill of Rights statements
const CONSENT_STATEMENTS: BillOfRightsStatement[] = [
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

export const SignUpForm: React.FC<SignUpFormProps> = ({
  onSubmit,
  isLoading = false,
  className = '',
}) => {
  // Form state management
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    trigger,
    formState: { errors, isValid },
  } = useForm<SignUpFormData>({
    mode: 'onChange',
    defaultValues: {
      role: 'creator',
      acceptTerms: false,
    },
  });

  // Local state
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Consent management
  const consent = useConsentFormIntegration(CONSENT_STATEMENTS, setValue, trigger);

  // Watch form values for validation
  const password = watch('password');
  const confirmPassword = watch('confirmPassword');
  const acceptTerms = watch('acceptTerms');
  const role = watch('role');

  // Handle consent completion
  const handleConsentComplete = useCallback(
    (consents: ConsentStatus) => {
      const consentData = {
        consents,
        timestamp: new Date().toISOString(),
        version: '1.0',
      };

      setValue('consents', consents);
      setValue('consentData', consentData);
      consent.closeConsentModal();

      // Trigger validation
      trigger(['consents', 'consentData']);
    },
    [setValue, trigger, consent]
  );

  // Handle form submission
  const handleFormSubmit = useCallback(
    async (data: SignUpFormData) => {
      setIsSubmitting(true);

      try {
        // Additional validation
        if (data.password !== data.confirmPassword) {
          throw new Error('Passwords do not match');
        }

        if (!data.acceptTerms) {
          throw new Error('You must accept the terms and conditions');
        }

        // Validate consent data
        if (data.consentData) {
          const consentErrors = validateConsentData(data.consentData);
          if (consentErrors.length > 0) {
            throw new Error('Invalid consent data');
          }
        }

        await onSubmit(data);
      } catch (error) {
        console.error('Sign up error:', error);
        // Error handling would typically show a toast or error message
      } finally {
        setIsSubmitting(false);
      }
    },
    [onSubmit]
  );

  // Check if consent is required and complete
  const consentValidation = consent.validateConsents(CONSENT_STATEMENTS);
  const isConsentComplete = consentValidation.isValid;

  // Calculate form completion status
  const canSubmit = isValid && acceptTerms && isConsentComplete && !isSubmitting && !isLoading;

  return (
    <div className={`max-w-md mx-auto ${className}`}>
      <div className="bg-white shadow-lg rounded-lg p-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-gray-900">Create Account</h2>
          <p className="mt-2 text-gray-600">Join our creator community</p>
        </div>

        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
          {/* Full Name */}
          <div>
            <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-2">
              Full Name
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                {...register('fullName', {
                  required: 'Full name is required',
                  minLength: { value: 2, message: 'Name must be at least 2 characters' },
                })}
                type="text"
                className={`
                  pl-10 w-full px-3 py-2 border rounded-md shadow-sm placeholder-gray-400
                  focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                  ${errors.fullName ? 'border-red-300' : 'border-gray-300'}
                `}
                placeholder="Enter your full name"
              />
            </div>
            {errors.fullName && (
              <p className="mt-1 text-sm text-red-600">{errors.fullName.message}</p>
            )}
          </div>

          {/* Email */}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                {...register('email', {
                  required: 'Email is required',
                  pattern: {
                    value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                    message: 'Invalid email address',
                  },
                })}
                type="email"
                className={`
                  pl-10 w-full px-3 py-2 border rounded-md shadow-sm placeholder-gray-400
                  focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                  ${errors.email ? 'border-red-300' : 'border-gray-300'}
                `}
                placeholder="Enter your email"
              />
            </div>
            {errors.email && (
              <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
            )}
          </div>

          {/* Password */}
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                {...register('password', {
                  required: 'Password is required',
                  minLength: { value: 8, message: 'Password must be at least 8 characters' },
                  pattern: {
                    value: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
                    message: 'Password must contain at least one lowercase letter, one uppercase letter, and one number',
                  },
                })}
                type={showPassword ? 'text' : 'password'}
                className={`
                  pl-10 pr-10 w-full px-3 py-2 border rounded-md shadow-sm placeholder-gray-400
                  focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                  ${errors.password ? 'border-red-300' : 'border-gray-300'}
                `}
                placeholder="Create a password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
            {errors.password && (
              <p className="mt-1 text-sm text-red-600">{errors.password.message}</p>
            )}
          </div>

          {/* Confirm Password */}
          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-2">
              Confirm Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                {...register('confirmPassword', {
                  required: 'Please confirm your password',
                  validate: (value) => value === password || 'Passwords do not match',
                })}
                type={showConfirmPassword ? 'text' : 'password'}
                className={`
                  pl-10 pr-10 w-full px-3 py-2 border rounded-md shadow-sm placeholder-gray-400
                  focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                  ${errors.confirmPassword ? 'border-red-300' : 'border-gray-300'}
                `}
                placeholder="Confirm your password"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
            {errors.confirmPassword && (
              <p className="mt-1 text-sm text-red-600">{errors.confirmPassword.message}</p>
            )}
          </div>

          {/* Role Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Account Type
            </label>
            <div className="flex space-x-4">
              <label className="flex items-center">
                <input
                  {...register('role')}
                  type="radio"
                  value="creator"
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                />
                <span className="ml-2 text-sm text-gray-700">Creator</span>
              </label>
              <label className="flex items-center">
                <input
                  {...register('role')}
                  type="radio"
                  value="founder"
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                />
                <span className="ml-2 text-sm text-gray-700">Founder</span>
              </label>
            </div>
          </div>

          {/* Creator's Bill of Rights */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-medium text-blue-900">Creator's Bill of Rights</h4>
                <p className="text-sm text-blue-700 mt-1">
                  Review and acknowledge our creator protection policies
                </p>
                {isConsentComplete && (
                  <div className="flex items-center mt-2 text-green-600">
                    <CheckCircle className="h-4 w-4 mr-1" />
                    <span className="text-sm font-medium">Acknowledged</span>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={consent.openConsentModal}
                className={`
                  px-4 py-2 text-sm font-medium rounded-md transition-colors
                  ${isConsentComplete
                    ? 'bg-green-600 text-white hover:bg-green-700'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                  }
                `}
              >
                {isConsentComplete ? 'View Rights' : 'Review Rights'}
              </button>
            </div>
            {!isConsentComplete && (
              <p className="mt-2 text-sm text-red-600">
                You must review and acknowledge the Creator's Bill of Rights to continue.
              </p>
            )}
          </div>

          {/* Terms and Conditions */}
          <div className="flex items-start">
            <input
              {...register('acceptTerms', {
                required: 'You must accept the terms and conditions',
              })}
              type="checkbox"
              className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <label className="ml-2 text-sm text-gray-700">
              I accept the{' '}
              <a href="/terms" className="text-blue-600 hover:text-blue-500">
                Terms and Conditions
              </a>{' '}
              and{' '}
              <a href="/privacy" className="text-blue-600 hover:text-blue-500">
                Privacy Policy
              </a>
            </label>
          </div>
          {errors.acceptTerms && (
            <p className="text-sm text-red-600">{errors.acceptTerms.message}</p>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={!canSubmit}
            className={`
              w-full py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white
              transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
              ${canSubmit
                ? 'bg-blue-600 hover:bg-blue-700'
                : 'bg-gray-300 cursor-not-allowed'
              }
            `}
          >
            {isSubmitting || isLoading ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white inline" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Creating Account...
              </>
            ) : (
              'Create Account'
            )}
          </button>
        </form>

        {/* Sign In Link */}
        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600">
            Already have an account?{' '}
            <a href="/signin" className="font-medium text-blue-600 hover:text-blue-500">
              Sign in
            </a>
          </p>
        </div>
      </div>

      {/* Creator's Bill of Rights Modal */}
      <CreatorBillOfRightsModal
        isOpen={consent.isConsentModalOpen}
        onClose={consent.closeConsentModal}
        onConsentComplete={handleConsentComplete}
        statements={CONSENT_STATEMENTS}
        isSubmitting={isSubmitting}
      />
    </div>
  );
};

export default SignUpForm;