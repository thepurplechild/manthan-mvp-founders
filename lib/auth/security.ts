/**
 * Authentication Security Measures
 * Implements rate limiting, token validation, and security best practices
 */

import { createHash } from 'crypto';

/**
 * Rate limiting configuration for different auth operations
 */
const RATE_LIMITS = {
  signIn: { maxAttempts: 5, windowMs: 15 * 60 * 1000 }, // 5 attempts per 15 minutes
  signUp: { maxAttempts: 3, windowMs: 60 * 60 * 1000 }, // 3 attempts per hour
  resendEmail: { maxAttempts: 3, windowMs: 5 * 60 * 1000 }, // 3 resends per 5 minutes
  resetPassword: { maxAttempts: 3, windowMs: 60 * 60 * 1000 }, // 3 resets per hour
} as const;

/**
 * In-memory rate limiting store (in production, use Redis or similar)
 * Structure: { [key: string]: { count: number, resetTime: number } }
 */
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

/**
 * Generate a rate limiting key based on IP address and operation
 * @param ip - Client IP address
 * @param operation - Type of operation being rate limited
 * @returns string - Unique key for rate limiting
 */
function getRateLimitKey(ip: string, operation: keyof typeof RATE_LIMITS): string {
  // Hash IP for privacy while maintaining uniqueness
  const hashedIp = createHash('sha256').update(ip).digest('hex').substring(0, 16);
  return `${operation}:${hashedIp}`;
}

/**
 * Check if an operation is rate limited
 * @param ip - Client IP address
 * @param operation - Type of operation
 * @returns Promise<{allowed: boolean, remainingAttempts: number, resetTime: number}>
 */
export async function checkRateLimit(
  ip: string,
  operation: keyof typeof RATE_LIMITS
): Promise<{
  allowed: boolean;
  remainingAttempts: number;
  resetTime: number;
  message?: string;
}> {
  const key = getRateLimitKey(ip, operation);
  const limit = RATE_LIMITS[operation];
  const now = Date.now();

  // Get current state
  const current = rateLimitStore.get(key);

  // Check if window has reset
  if (!current || now > current.resetTime) {
    // Reset or initialize
    const resetTime = now + limit.windowMs;
    rateLimitStore.set(key, { count: 1, resetTime });

    return {
      allowed: true,
      remainingAttempts: limit.maxAttempts - 1,
      resetTime
    };
  }

  // Check if limit exceeded
  if (current.count >= limit.maxAttempts) {
    const minutesUntilReset = Math.ceil((current.resetTime - now) / (60 * 1000));
    return {
      allowed: false,
      remainingAttempts: 0,
      resetTime: current.resetTime,
      message: `Too many attempts. Please try again in ${minutesUntilReset} minute${minutesUntilReset > 1 ? 's' : ''}.`
    };
  }

  // Increment counter
  current.count++;
  rateLimitStore.set(key, current);

  return {
    allowed: true,
    remainingAttempts: limit.maxAttempts - current.count,
    resetTime: current.resetTime
  };
}

/**
 * Reset rate limit for a specific operation and IP
 * (useful for successful operations that should reset the counter)
 * @param ip - Client IP address
 * @param operation - Type of operation
 */
export function resetRateLimit(ip: string, operation: keyof typeof RATE_LIMITS): void {
  const key = getRateLimitKey(ip, operation);
  rateLimitStore.delete(key);
}

/**
 * Validate email format with enhanced security checks
 * @param email - Email address to validate
 * @returns {valid: boolean, reason?: string}
 */
export function validateEmail(email: string): { valid: boolean; reason?: string } {
  if (!email) {
    return { valid: false, reason: 'Email is required' };
  }

  if (email.length > 254) {
    return { valid: false, reason: 'Email is too long' };
  }

  // Basic email regex (RFC 5322 compliant)
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

  if (!emailRegex.test(email)) {
    return { valid: false, reason: 'Invalid email format' };
  }

  // Check for common temporary email domains (basic list)
  const tempEmailDomains = [
    '10minutemail.com',
    'tempmail.org',
    'guerrillamail.com',
    'throwaway.email',
    'mailinator.com'
  ];

  const domain = email.split('@')[1]?.toLowerCase();
  if (tempEmailDomains.includes(domain)) {
    return { valid: false, reason: 'Temporary email addresses are not allowed' };
  }

  return { valid: true };
}

/**
 * Validate password strength
 * @param password - Password to validate
 * @returns {valid: boolean, score: number, feedback: string[]}
 */
export function validatePassword(password: string): {
  valid: boolean;
  score: number;
  feedback: string[];
} {
  const feedback: string[] = [];
  let score = 0;

  if (!password) {
    return {
      valid: false,
      score: 0,
      feedback: ['Password is required']
    };
  }

  // Length checks
  if (password.length < 8) {
    feedback.push('Password must be at least 8 characters long');
  } else {
    score += 1;
  }

  if (password.length >= 12) {
    score += 1;
  }

  // Character type checks
  if (/[a-z]/.test(password)) {
    score += 1;
  } else {
    feedback.push('Include at least one lowercase letter');
  }

  if (/[A-Z]/.test(password)) {
    score += 1;
  } else {
    feedback.push('Include at least one uppercase letter');
  }

  if (/\d/.test(password)) {
    score += 1;
  } else {
    feedback.push('Include at least one number');
  }

  if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    score += 1;
  } else {
    feedback.push('Include at least one special character (!@#$%^&*...)');
  }

  // Common password checks
  const commonPasswords = [
    'password', '123456', '123456789', 'qwerty', 'abc123',
    'password123', 'admin', 'letmein', 'welcome', 'monkey'
  ];

  if (commonPasswords.includes(password.toLowerCase())) {
    feedback.push('Avoid common passwords');
    score = Math.max(0, score - 2);
  }

  // Sequential characters
  if (/(.)\1{2,}/.test(password)) {
    feedback.push('Avoid repeating characters');
    score = Math.max(0, score - 1);
  }

  const valid = score >= 4 && feedback.length === 0;

  return {
    valid,
    score,
    feedback
  };
}

/**
 * Sanitize user input to prevent XSS and injection attacks
 * @param input - User input string
 * @returns string - Sanitized input
 */
export function sanitizeInput(input: string): string {
  if (!input) return '';

  return input
    .trim()
    .replace(/[<>'"&]/g, (char) => {
      switch (char) {
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '"': return '&quot;';
        case "'": return '&#x27;';
        case '&': return '&amp;';
        default: return char;
      }
    });
}

/**
 * Generate a secure client fingerprint for additional security
 * @param userAgent - User agent string
 * @param ip - IP address
 * @returns string - Security fingerprint
 */
export function generateSecurityFingerprint(userAgent?: string, ip?: string): string {
  const components = [
    userAgent || 'unknown',
    ip || 'unknown',
    Date.now().toString()
  ];

  return createHash('sha256')
    .update(components.join('|'))
    .digest('hex')
    .substring(0, 32);
}

/**
 * Check if a verification token has expired
 * @param tokenCreatedAt - When the token was created
 * @param expirationHours - Token expiration time in hours (default 24)
 * @returns boolean - True if expired
 */
export function isTokenExpired(tokenCreatedAt: Date, expirationHours: number = 24): boolean {
  const expirationTime = new Date(tokenCreatedAt.getTime() + (expirationHours * 60 * 60 * 1000));
  return new Date() > expirationTime;
}

/**
 * Log security events for monitoring and analysis
 * @param event - Security event type
 * @param details - Event details
 * @param ip - Client IP address
 * @param userAgent - User agent string
 */
export function logSecurityEvent(
  event: 'rate_limit_exceeded' | 'invalid_credentials' | 'suspicious_activity' | 'successful_login' | 'failed_verification',
  details: Record<string, any>,
  ip?: string,
  userAgent?: string
): void {
  const logEntry = {
    timestamp: new Date().toISOString(),
    event,
    details,
    ip: ip ? createHash('sha256').update(ip).digest('hex').substring(0, 16) : undefined,
    userAgent: userAgent ? createHash('sha256').update(userAgent).digest('hex').substring(0, 16) : undefined
  };

  // In production, send to logging service (e.g., Sentry, LogRocket, etc.)
  console.log('Security Event:', JSON.stringify(logEntry));
}

/**
 * Validate and sanitize full name input
 * @param fullName - Full name input
 * @returns {valid: boolean, sanitized: string, reason?: string}
 */
export function validateFullName(fullName: string): {
  valid: boolean;
  sanitized: string;
  reason?: string;
} {
  if (!fullName || !fullName.trim()) {
    return {
      valid: false,
      sanitized: '',
      reason: 'Full name is required'
    };
  }

  const sanitized = sanitizeInput(fullName);

  if (sanitized.length < 2) {
    return {
      valid: false,
      sanitized,
      reason: 'Full name must be at least 2 characters'
    };
  }

  if (sanitized.length > 100) {
    return {
      valid: false,
      sanitized,
      reason: 'Full name cannot exceed 100 characters'
    };
  }

  // Check for valid name characters (letters, spaces, hyphens, apostrophes)
  if (!/^[a-zA-Z\s\-']+$/.test(sanitized)) {
    return {
      valid: false,
      sanitized,
      reason: 'Full name can only contain letters, spaces, hyphens, and apostrophes'
    };
  }

  return {
    valid: true,
    sanitized: sanitized.trim()
  };
}