import { NextRequest, NextResponse } from 'next/server';

interface ErrorLogEntry {
  timestamp: string;
  error: string;
  stack?: string;
  digest?: string;
  userAgent?: string;
  url?: string;
  environment: string;
}

function log(event: string, payload: Record<string, unknown>) {
  console.log(
    JSON.stringify({
      scope: 'error-log',
      event,
      ts: new Date().toISOString(),
      ...payload,
    })
  );
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();

    const errorEntry: ErrorLogEntry = {
      timestamp: body.timestamp || new Date().toISOString(),
      error: body.error || 'Unknown error',
      stack: body.stack,
      digest: body.digest,
      userAgent: request.headers.get('user-agent') || 'unknown',
      url: body.url || request.headers.get('referer') || 'unknown',
      environment: process.env.NODE_ENV || 'unknown',
    };

    // Log to console with structured format
    log('client_error_reported', {
      error: errorEntry.error,
      digest: errorEntry.digest,
      user_agent: errorEntry.userAgent,
      url: errorEntry.url,
      has_stack: Boolean(errorEntry.stack),
    });

    // In production, you might want to:
    // 1. Send to external logging service (Sentry, LogRocket, etc.)
    // 2. Store in database for analysis
    // 3. Send alerts for critical errors

    return NextResponse.json({
      success: true,
      logged_at: errorEntry.timestamp
    });

  } catch (error) {
    log('error_log_endpoint_failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return NextResponse.json({
      success: false,
      error: 'Failed to log error'
    }, { status: 500 });
  }
}

export async function GET(): Promise<NextResponse> {
  // Simple endpoint to verify error logging is working
  return NextResponse.json({
    status: 'active',
    endpoint: 'error-log',
    description: 'Endpoint for logging client-side errors',
    timestamp: new Date().toISOString(),
  });
}