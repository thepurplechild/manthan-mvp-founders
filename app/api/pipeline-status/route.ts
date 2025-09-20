import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

function log(event: string, payload: Record<string, unknown>) {
  console.log(
    JSON.stringify({ scope: 'status', event, ts: new Date().toISOString(), ...payload })
  );
}

export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams;
  const ingestionIdParam = search.get('ingestionId') || search.get('ingestion_id');
  const projectIdParam = search.get('projectId');

  if (!ingestionIdParam && !projectIdParam) {
    return NextResponse.json({ error: 'ingestionId or projectId required' }, { status: 400 });
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let ingestionId = ingestionIdParam;

  if (!ingestionId && projectIdParam) {
    const { data: latest } = await supabase
      .from('ingestions')
      .select('id')
      .eq('project_id', projectIdParam)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    ingestionId = latest?.id || null;
  }

  if (!ingestionId) {
    return NextResponse.json({ error: 'No ingestion found' }, { status: 404 });
  }

  const { data: ingestion, error: ingestionError } = await supabase
    .from('ingestions')
    .select('*')
    .eq('id', ingestionId)
    .maybeSingle();

  if (ingestionError || !ingestion) {
    log('not_found', { ingestion_id: ingestionId, err: ingestionError?.message });
    return NextResponse.json({ error: 'Ingestion not found' }, { status: 404 });
  }

  const { data: stepsData } = await supabase
    .from('ingestion_steps')
    .select('name,status,started_at,finished_at,output,error')
    .eq('ingestion_id', ingestionId)
    .order('started_at', { ascending: true });

  const steps = (stepsData || []).map((step) => ({
    name: step.name,
    status: step.status,
    startedAt: step.started_at,
    finishedAt: step.finished_at,
    output: step.output,
    error: step.error,
  }));

  const activeStep = steps.find((step) => step.status === 'running')
    || steps.find((step) => step.status === 'queued' || step.status === 'pending');

  const responsePayload = {
    ingestionId,
    projectId: ingestion.project_id,
    status: ingestion.status,
    progress: ingestion.progress,
    error: ingestion.error,
    steps,
    activeStep: activeStep ? { name: activeStep.name, status: activeStep.status } : null,
  };

  return NextResponse.json({ data: responsePayload });
}
