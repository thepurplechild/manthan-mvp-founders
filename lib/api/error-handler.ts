/**
 * API Error Handling and Security Wrapper for Pages Router
 * Provides consistent error handling, validation, and security measures
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { logSecurityEvent } from '@/lib/auth/security';

/**
 * Standard API response interface
 */
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp?: string;
}

/**
 * API handler function type
 */
export type ApiHandler<T = any> = (
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse<T>>
) => Promise<void> | void;

/**
 * HTTP methods allowed for API routes
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

/**
 * Configuration options for API route wrapper
 */
export interface ApiOptions {
  allowedMethods: HttpMethod[];
  requireAuth?: boolean;
  rateLimit?: {
    maxRequests: number;
    windowMs: number;
  };
  cors?: {
    origin?: string | string[];
    credentials?: boolean;
  };
}

/**
 * Simple in-memory rate limiting store
 * In production, use Redis or similar persistent store
 */
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

/**
 * CORS headers for API responses
 */
function setCorsHeaders(res: NextApiResponse, options?: ApiOptions['cors']) {
  if (!options) return;

  const origin = Array.isArray(options.origin)
    ? options.origin.join(', ')
    : options.origin || '*';

  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (options.credentials) {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
}

/**
 * Rate limiting check
 */
function checkApiRateLimit(
  req: NextApiRequest,
  options: NonNullable<ApiOptions['rateLimit']>
): { allowed: boolean; remainingRequests: number } {
  const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
                   req.connection.remoteAddress ||
                   '127.0.0.1';

  const key = `api:${req.url}:${clientIp}`;
  const now = Date.now();
  const windowMs = options.windowMs;

  const current = rateLimitStore.get(key);

  if (!current || now > current.resetTime) {
    // New window or expired
    rateLimitStore.set(key, { count: 1, resetTime: now + windowMs });
    return { allowed: true, remainingRequests: options.maxRequests - 1 };
  }

  if (current.count >= options.maxRequests) {
    return { allowed: false, remainingRequests: 0 };
  }

  current.count++;
  rateLimitStore.set(key, current);

  return { allowed: true, remainingRequests: options.maxRequests - current.count };
}

/**
 * Enhanced API route wrapper with security and error handling
 * @param handler - The API route handler function
 * @param options - Configuration options
 * @returns Wrapped API handler with error handling and security
 */
export function withApiHandler<T = any>(
  handler: ApiHandler<T>,
  options: ApiOptions
) {
  return async (req: NextApiRequest, res: NextApiResponse<ApiResponse<T>>) => {
    const startTime = Date.now();
    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
                     req.connection.remoteAddress ||
                     '127.0.0.1';

    try {
      // Set security headers
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

      // Set CORS headers if configured
      if (options.cors) {
        setCorsHeaders(res, options.cors);
      }

      // Handle preflight requests
      if (req.method === 'OPTIONS') {
        return res.status(200).end();
      }

      // Check allowed methods
      if (!options.allowedMethods.includes(req.method as HttpMethod)) {
        logSecurityEvent('method_not_allowed', {
          method: req.method,
          url: req.url,
          allowedMethods: options.allowedMethods
        }, clientIp, req.headers['user-agent']);

        return res.status(405).json({
          success: false,
          error: `Method ${req.method} not allowed. Allowed methods: ${options.allowedMethods.join(', ')}`,
          timestamp: new Date().toISOString()
        });
      }

      // Rate limiting
      if (options.rateLimit) {
        const rateCheck = checkApiRateLimit(req, options.rateLimit);

        if (!rateCheck.allowed) {
          logSecurityEvent('rate_limit_exceeded', {
            url: req.url,
            method: req.method,
            maxRequests: options.rateLimit.maxRequests,
            windowMs: options.rateLimit.windowMs
          }, clientIp, req.headers['user-agent']);

          return res.status(429).json({
            success: false,
            error: 'Rate limit exceeded. Please try again later.',
            timestamp: new Date().toISOString()
          });
        }

        // Set rate limit headers
        res.setHeader('X-RateLimit-Limit', options.rateLimit.maxRequests);
        res.setHeader('X-RateLimit-Remaining', rateCheck.remainingRequests);
        res.setHeader('X-RateLimit-Reset', new Date(Date.now() + options.rateLimit.windowMs).toISOString());
      }

      // Authentication check (if required)
      if (options.requireAuth) {
        // Check for session cookie or authorization header
        const authHeader = req.headers.authorization;
        const sessionCookie = req.cookies['sb-access-token'] || req.cookies['supabase-auth-token'];

        if (!authHeader && !sessionCookie) {
          return res.status(401).json({
            success: false,
            error: 'Authentication required',
            timestamp: new Date().toISOString()
          });
        }
      }

      // Execute the actual handler
      await handler(req, res);

      // Log successful API call
      const duration = Date.now() - startTime;
      console.log(`API ${req.method} ${req.url} - ${res.statusCode} - ${duration}ms`);

    } catch (error) {
      console.error('API handler error:', error);

      // Log the error for monitoring
      logSecurityEvent('api_error', {
        url: req.url,
        method: req.method,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      }, clientIp, req.headers['user-agent']);

      // Don't expose internal error details in production
      const isDev = process.env.NODE_ENV === 'development';

      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: isDev && error instanceof Error
            ? error.message
            : 'Internal server error',
          timestamp: new Date().toISOString()
        });
      }
    }
  };
}

/**
 * Validate required environment variables for API routes
 */
export function validateApiEnvironment(required: string[]): void {
  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`
    );
  }
}

/**
 * Sanitize request data to prevent injection attacks
 */
export function sanitizeRequestData<T extends Record<string, any>>(data: T): T {
  const sanitized = { ...data } as any;

  for (const [key, value] of Object.entries(sanitized)) {
    if (typeof value === 'string') {
      // Basic XSS prevention
      sanitized[key] = value
        .replace(/[<>'"&]/g, (char) => {
          switch (char) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '"': return '&quot;';
            case "'": return '&#x27;';
            case '&': return '&amp;';
            default: return char;
          }
        })
        .trim();
    }
  }

  return sanitized;
}

/**
 * Create a standard API response
 */
export function createApiResponse<T>(
  success: boolean,
  data?: T,
  error?: string
): ApiResponse<T> {
  return {
    success,
    data,
    error,
    timestamp: new Date().toISOString()
  };
}