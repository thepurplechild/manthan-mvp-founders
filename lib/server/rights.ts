'use server';

import { headers } from 'next/headers';

import { getServerClient } from '@/lib/supabase/server';

interface RightsAcceptanceInput {
  userId: string;
  version: string;
  ipAddress?: string | null;
}

export async function recordRightsAcceptance({
  userId,
  version,
  ipAddress,
}: RightsAcceptanceInput): Promise<void> {
  if (!userId) {
    throw new Error('User identifier is required to record rights acceptance.');
  }

  const supabase = getServerClient();
  const { error } = await supabase.rpc('record_rights_acceptance', {
    p_user_id: userId,
    p_version: version,
    p_ip_address: ipAddress ?? null,
  });

  if (error) {
    throw new Error(`Failed to record rights acceptance: ${error.message}`);
  }
}

export async function recordRightsAcceptanceFromHeaders(userId: string, version: string): Promise<void> {
  const forwardedFor = headers().get('x-forwarded-for');
  const ipAddress = forwardedFor ? forwardedFor.split(',')[0]?.trim() : undefined;
  await recordRightsAcceptance({ userId, version, ipAddress: ipAddress || null });
}
