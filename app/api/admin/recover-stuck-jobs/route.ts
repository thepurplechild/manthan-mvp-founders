import { NextRequest, NextResponse } from 'next/server';

import { enqueueIngestionJob } from '@/lib/jobs/queue';
import { getAdminClient } from '@/lib/supabase/admin';

const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

function log(event: string, payload: Record<string, unknown>) {
  console.log(
    JSON.stringify({ scope: 'admin-recovery', event, ts: new Date().toISOString(), ...payload })
  );
}

export async function POST(request: NextRequest) {
  if (!ADMIN_TOKEN) {
    return NextResponse.json({ error: 'ADMIN_TOKEN not configured' }, { status: 500 });
  }

  const provided = request.headers.get('x-admin-token') || request.headers.get('authorization');
  if (!provided || provided.replace('Bearer ', '') !== ADMIN_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdminClient();
  const timeoutMinutes = Number(process.env.RECOVERY_TIMEOUT_MIN || 15);
  const threshold = new Date(Date.now() - timeoutMinutes * 60 * 1000).toISOString();

  const { data: stuck, error } = await supabase
    .from('ingestions')
    .select('id, project_id, user_id, status')
    .in('status', ['queued', 'processing'])
    .lt('updated_at', threshold);

  if (error) {
    log('query_failed', { err: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!stuck || stuck.length === 0) {
    return NextResponse.json({ recovered: 0, ingestionIds: [] });
  }

  const ids = stuck.map((row) => row.id);

  const { error: updateError } = await supabase
    .from('ingestions')
    .update({
      status: 'queued',
      progress: 0,
      error: 'Recovered by admin tool',
      updated_at: new Date().toISOString(),
    })
    .in('id', ids);

  if (updateError) {
    log('update_failed', { err: updateError.message });
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  for (const row of stuck) {
    await enqueueIngestionJob({
      ingestionId: row.id,
      projectId: row.project_id,
      userId: row.user_id,
      attempts: row.status === 'processing' ? 1 : 0,
    });
  }

  log('recovered', { count: ids.length, ingestion_ids: ids });

  return NextResponse.json({ recovered: ids.length, ingestionIds: ids });
}
