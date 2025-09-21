import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * 🔐 Enhanced Creator's Bill of Rights Acceptance API
 *
 * Handles rights acceptance with comprehensive error handling,
 * IP address tracking, retry mechanisms, and detailed logging.
 */

interface RightsAcceptanceRequest {
  version: string;
  retryAttempt: number;
}

interface RightsAcceptanceResponse {
  success: boolean;
  message?: string;
  error?: string;
  retryable?: boolean;
  acceptanceId?: string;
}

interface AcceptanceAttempt {
  userId: string;
  version: string;
  ipAddress?: string;
  userAgent?: string;
  timestamp: string;
  retryAttempt: number;
}

const DEFAULT_VERSION = '1.0 - MVP Launch';
const MAX_RETRY_ATTEMPTS = 3;

/**
 * Create authenticated Supabase client
 */
async function createAuthenticatedClient() {
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          // Note: Response cookies will be handled by Next.js
        },
      },
    }
  );

  return supabase;
}

/**
 * Extract and validate IP address from request headers
 */
function extractClientIP(request: NextRequest): string | null {
  // Check multiple headers for IP address (common in proxy setups)
  const candidates = [
    request.headers.get('x-forwarded-for'),
    request.headers.get('x-real-ip'),
    request.headers.get('cf-connecting-ip'), // Cloudflare
    request.headers.get('x-client-ip')
    // Note: request.ip is not available in App Router API routes
  ];

  for (const candidate of candidates) {
    if (candidate) {
      // Handle comma-separated list (x-forwarded-for)
      const ip = candidate.split(',')[0]?.trim();

      // Basic IP validation
      if (ip && /^[\d.:a-f]+$/i.test(ip)) {
        return ip;
      }
    }
  }

  return null;
}

/**
 * Validate request payload
 */
function validateAcceptanceRequest(body: any): {
  isValid: boolean;
  errors: string[];
  data: RightsAcceptanceRequest;
} {
  const errors: string[] = [];

  // Version validation
  let version = DEFAULT_VERSION;
  if (body?.version) {
    if (typeof body.version !== 'string') {
      errors.push('Version must be a string');
    } else if (body.version.trim().length === 0) {
      errors.push('Version cannot be empty');
    } else if (body.version.length > 100) {
      errors.push('Version string too long');
    } else {
      version = body.version.trim();
    }
  }

  // Retry attempt validation
  let retryAttempt = 0;
  if (body?.retryAttempt !== undefined) {
    if (typeof body.retryAttempt !== 'number' || body.retryAttempt < 0) {
      errors.push('Invalid retry attempt number');
    } else if (body.retryAttempt > MAX_RETRY_ATTEMPTS) {
      errors.push(`Maximum retry attempts exceeded (${MAX_RETRY_ATTEMPTS})`);
    } else {
      retryAttempt = body.retryAttempt;
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    data: { version, retryAttempt }
  };
}

/**
 * Record rights acceptance with comprehensive error handling
 */
async function recordRightsAcceptance(
  userId: string,
  version: string,
  ipAddress?: string | null
): Promise<{ success: boolean; error?: string; acceptanceId?: string }> {
  try {
    // Use admin client for reliable database operations
    const supabaseAdmin = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        cookies: {
          getAll: () => [],
          setAll: () => {},
        },
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );

    console.log('🔄 Recording rights acceptance...', { userId, version, hasIP: !!ipAddress });

    // Use the RPC function for atomic operation
    const { data, error } = await supabaseAdmin.rpc('record_rights_acceptance', {
      p_user_id: userId,
      p_version: version,
      p_ip_address: ipAddress
    });

    if (error) {
      console.error('❌ RPC call failed:', error);
      return {
        success: false,
        error: `Database operation failed: ${error.message}`
      };
    }

    if (!data) {
      console.error('❌ No acceptance ID returned');
      return {
        success: false,
        error: 'Failed to create rights acceptance record'
      };
    }

    console.log('✅ Rights acceptance recorded successfully:', data);
    return {
      success: true,
      acceptanceId: data
    };

  } catch (error) {
    console.error('💥 Error in recordRightsAcceptance:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown database error'
    };
  }
}

/**
 * Log acceptance attempt for monitoring and debugging
 */
function logAcceptanceAttempt(attempt: AcceptanceAttempt, result: { success: boolean; error?: string; acceptanceId?: string }) {
  const logData = {
    userId: attempt.userId,
    version: attempt.version,
    ipAddress: attempt.ipAddress,
    userAgent: attempt.userAgent,
    timestamp: attempt.timestamp,
    retryAttempt: attempt.retryAttempt,
    success: result.success,
    error: result.error,
    acceptanceId: result.acceptanceId,
    duration: Date.now() - new Date(attempt.timestamp).getTime()
  };

  // In production, send to monitoring service
  console.log('📊 Rights acceptance attempt logged:', JSON.stringify(logData, null, 2));

  // TODO: Add monitoring service integration
  // await sendToMonitoring('rights_acceptance_attempt', logData);
}

export async function POST(request: NextRequest) {
  const startTime = performance.now();

  try {
    // Extract client information
    const userAgent = request.headers.get('user-agent');
    const ipAddress = extractClientIP(request);

    console.log('🚀 Rights acceptance request started:', {
      hasUserAgent: !!userAgent,
      hasIP: !!ipAddress,
      timestamp: new Date().toISOString()
    });

    // Authenticate user
    const supabase = await createAuthenticatedClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();

    if (authError || !authData.user) {
      console.error('❌ Authentication failed:', authError);
      return NextResponse.json(
        {
          success: false,
          error: 'Authentication required',
          retryable: false
        } as RightsAcceptanceResponse,
        { status: 401 }
      );
    }

    const userId = authData.user.id;
    console.log('✅ User authenticated:', userId);

    // Parse and validate request body
    let requestBody: any = {};
    try {
      requestBody = await request.json();
    } catch (parseError) {
      console.warn('⚠️ Failed to parse request body, using defaults');
      // Continue with defaults
    }

    const validation = validateAcceptanceRequest(requestBody);
    if (!validation.isValid) {
      const errorMsg = `Invalid request: ${validation.errors.join(', ')}`;
      console.error('❌ Request validation failed:', errorMsg);

      return NextResponse.json(
        {
          success: false,
          error: errorMsg,
          retryable: false
        } as RightsAcceptanceResponse,
        { status: 400 }
      );
    }

    const { version, retryAttempt = 0 } = validation.data;

    // Create attempt record for logging
    const attempt: AcceptanceAttempt = {
      userId,
      version,
      ipAddress: ipAddress || undefined,
      userAgent: userAgent || undefined,
      timestamp: new Date().toISOString(),
      retryAttempt
    };

    // Record rights acceptance
    const result = await recordRightsAcceptance(userId, version, ipAddress);

    // Log the attempt
    logAcceptanceAttempt(attempt, result);

    if (result.success) {
      const duration = (performance.now() - startTime).toFixed(2);
      console.log(`✅ Rights acceptance completed successfully in ${duration}ms`);

      return NextResponse.json({
        success: true,
        message: 'Creator\'s Bill of Rights acceptance recorded successfully',
        acceptanceId: result.acceptanceId
      } as RightsAcceptanceResponse);
    } else {
      const duration = (performance.now() - startTime).toFixed(2);
      console.error(`❌ Rights acceptance failed in ${duration}ms:`, result.error);

      // Determine if error is retryable
      const isRetryable = !result.error?.includes('duplicate') &&
                         !result.error?.includes('constraint') &&
                         (retryAttempt || 0) < MAX_RETRY_ATTEMPTS;

      return NextResponse.json(
        {
          success: false,
          error: result.error || 'Failed to record acceptance',
          retryable: isRetryable
        } as RightsAcceptanceResponse,
        { status: 500 }
      );
    }

  } catch (error) {
    const duration = (performance.now() - startTime).toFixed(2);
    console.error(`💥 Fatal rights acceptance error in ${duration}ms:`, error);

    const errorMessage = error instanceof Error ? error.message : 'Unexpected server error';

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        retryable: true
      } as RightsAcceptanceResponse,
      { status: 500 }
    );
  }
}

// Support OPTIONS for CORS preflight
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}