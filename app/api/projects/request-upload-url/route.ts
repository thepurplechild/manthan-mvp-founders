import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js';

type RequestBody = {
  fileName: string;
  fileType: string;
  projectId: string;
};

type SuccessResponse = {
  signedUrl: string;
  filePath: string;
};

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) {
    const missing = [
      !url ? 'NEXT_PUBLIC_SUPABASE_URL' : null,
      !anon ? 'NEXT_PUBLIC_SUPABASE_ANON_KEY' : null,
      !service ? 'SUPABASE_SERVICE_ROLE_KEY' : null,
    ]
      .filter(Boolean)
      .join(', ');
    throw new Error(`Missing required environment variables: ${missing}`);
  }
  return { url, anon, service };
}

function sanitizeFileName(raw: string): string {
  const trimmed = raw.trim();
  const safe = trimmed.replace(/[^a-zA-Z0-9._-]/g, '_');
  if (!safe || safe === '.' || safe === '..') {
    throw new Error('Invalid fileName after sanitization.');
  }
  return safe;
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const { url, anon, service } = assertEnv();

    let body: RequestBody;
    try {
      body = (await req.json()) as RequestBody;
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body.' },
        { status: 400 }
      );
    }

    const { fileName, fileType, projectId } = body ?? {};
    const errors: string[] = [];

    if (typeof fileName !== 'string' || fileName.length === 0) {
      errors.push('fileName must be a non-empty string.');
    }
    if (typeof fileType !== 'string' || fileType.length === 0) {
      errors.push('fileType must be a non-empty string.');
    }
    if (typeof projectId !== 'string' || !UUID_V4_REGEX.test(projectId)) {
      errors.push('projectId must be a valid UUID v4 string.');
    }

    if (errors.length > 0) {
      return NextResponse.json({ error: errors.join(' ') }, { status: 400 });
    }

    const safeFileName = sanitizeFileName(fileName);

    const cookieStore = await cookies();
    const supabaseAuth = createServerClient(url, anon, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    });

    const {
      data: { user },
      error: userError,
    } = await supabaseAuth.auth.getUser();

    if (userError) {
      return NextResponse.json(
        { error: 'Failed to verify session.' },
        { status: 401 }
      );
    }
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized: no active session.' },
        { status: 401 }
      );
    }

    const supabaseAdmin = createSupabaseAdminClient(url, service);
    const filePath = `${user.id}/${projectId}/${safeFileName}`;

    const { data, error: storageError } = await supabaseAdmin.storage
      .from('script-uploads')
      .createSignedUploadUrl(filePath);

    if (storageError || !data?.signedUrl) {
      return NextResponse.json(
        { error: 'Failed to create signed upload URL.' },
        { status: 500 }
      );
    }

    const payload: SuccessResponse = {
      signedUrl: data.signedUrl,
      filePath,
    };

    return NextResponse.json(payload, { status: 200 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Unexpected server error.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Method Not Allowed' }, { status: 405 });
}
export async function PUT() {
  return NextResponse.json({ error: 'Method Not Allowed' }, { status: 405 });
}
export async function DELETE() {
  return NextResponse.json({ error: 'Method Not Allowed' }, { status: 405 });
}
