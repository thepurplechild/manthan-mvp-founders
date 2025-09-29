import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { enqueuePackagingJob } from '@/lib/queue';

type RequestBody = {
  projectId: string;
  filePath: string;
};

type SuccessResponse = {
  ok: true;
  queued: true;
  projectId: string;
  filePath: string;
};

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    const missing = [
      !url ? 'NEXT_PUBLIC_SUPABASE_URL' : null,
      !anon ? 'NEXT_PUBLIC_SUPABASE_ANON_KEY' : null,
    ]
      .filter(Boolean)
      .join(', ');
    throw new Error(`Missing required Supabase env vars: ${missing}`);
  }
  return { url, anon };
}

function validateBody(
  body: unknown
): { projectId: string; filePath: string } | { error: string } {
  if (!body || typeof body !== 'object') return { error: 'Invalid JSON body.' };
  const { projectId, filePath } = body as RequestBody;

  const errs: string[] = [];
  if (typeof projectId !== 'string' || !UUID_V4_REGEX.test(projectId)) {
    errs.push('projectId must be a valid UUID v4 string.');
  }
  if (typeof filePath !== 'string' || filePath.trim().length === 0) {
    errs.push('filePath must be a non-empty string.');
  }
  if (typeof filePath === 'string' && filePath.includes('..')) {
    errs.push('filePath must not contain path traversal segments.');
  }

  if (errs.length) return { error: errs.join(' ') };
  return { projectId, filePath: filePath.trim() };
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const { url, anon } = assertSupabaseEnv();

    // Parse and validate body
    let parsed: { projectId: string; filePath: string } | { error: string };
    try {
      const body = (await req.json()) as unknown;
      parsed = validateBody(body);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
    }
    if ('error' in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const { projectId, filePath } = parsed;

    // Auth (cookie-bound)
    const cookieStore = await cookies();
    const supabase = createServerClient(url, anon, {
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
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr) {
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

    // 1) Record upload
    const { error: insertErr } = await supabase.from('script_uploads').insert({
      project_id: projectId,
      file_path: filePath,
      uploaded_by: user.id,
    });

    if (insertErr) {
      return NextResponse.json(
        { error: 'Failed to record upload.' },
        { status: 500 }
      );
    }

    // 2) Update project status to submitted (owner-scoped)
    const { error: updateErr } = await supabase
      .from('projects')
      .update({ status: 'submitted' })
      .eq('id', projectId)
      .eq('owner_id', user.id);

    if (updateErr) {
      return NextResponse.json(
        { error: 'Failed to update project status.' },
        { status: 500 }
      );
    }

    // 3) Enqueue async job
    await enqueuePackagingJob({
      projectId,
      filePath,
      userId: user.id,
    });

    const payload: SuccessResponse = {
      ok: true,
      queued: true,
      projectId,
      filePath,
    };
    return NextResponse.json(payload, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected server error.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Disallow other methods
export async function GET() {
  return NextResponse.json({ error: 'Method Not Allowed' }, { status: 405 });
}
export async function PUT() {
  return NextResponse.json({ error: 'Method Not Allowed' }, { status: 405 });
}
export async function DELETE() {
  return NextResponse.json({ error: 'Method Not Allowed' }, { status: 405 });
}
