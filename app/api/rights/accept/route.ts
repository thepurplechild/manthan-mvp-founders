import { NextResponse } from 'next/server';

import { getRlsServerClient } from '@/lib/supabase/server';
import { recordRightsAcceptanceFromHeaders } from '@/lib/server/rights';

const DEFAULT_VERSION = '1.0 - MVP Launch';

export async function POST(request: Request) {
  const supabase = await getRlsServerClient();
  const { data, error: userError } = await supabase.auth.getUser();

  if (userError || !data.user) {
    if (userError) {
      console.error('rights.accept: Failed to read authenticated user', userError);
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const payload = await request
      .json()
      .catch(() => ({ version: DEFAULT_VERSION }));

    const version =
      typeof payload?.version === 'string' && payload.version.trim().length > 0
        ? payload.version.trim()
        : DEFAULT_VERSION;

    await recordRightsAcceptanceFromHeaders(data.user.id, version);

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('rights.accept: Failed to record acceptance', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
