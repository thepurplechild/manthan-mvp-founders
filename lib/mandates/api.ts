import type { PostgrestError } from '@supabase/supabase-js';

import { createBrowserClient } from '@/lib/supabase/browser-client';
import type { MandateInput, MandateUpdateInput } from './schema';

export interface ListMandatesOptions {
  search?: string;
  limit?: number;
  offset?: number;
  signal?: AbortSignal;
}

export interface MandateRecord {
  id: string;
  code: string;
  title: string;
  description: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

function handleError(error: PostgrestError): never {
  const message = error.message || 'Unexpected Supabase error';
  throw new Error(message);
}

export async function listMandates({
  search,
  limit = 10,
  offset = 0,
  signal,
}: ListMandatesOptions): Promise<{ data: MandateRecord[]; count: number }> {
  const supabase = createBrowserClient();

  let query = supabase
    .from('platform_mandates')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (signal) {
    query = query.abortSignal(signal);
  }

  if (search && search.trim()) {
    const value = `%${search.trim()}%`;
    query = query.or(`code.ilike.${value},title.ilike.${value}`);
  }

  const { data, error, count } = await query;

  if (error) {
    handleError(error);
  }

  return {
    data: (data ?? []) as MandateRecord[],
    count: count ?? 0,
  };
}

export async function createMandate(input: MandateInput): Promise<MandateRecord> {
  const supabase = createBrowserClient();

  const payload = {
    code: input.code.trim().toUpperCase(),
    title: input.title.trim(),
    description: input.description ? input.description : null,
    is_active: input.is_active,
  };

  const { data, error } = await supabase
    .from('platform_mandates')
    .insert(payload)
    .select('*')
    .single();

  if (error) {
    handleError(error);
  }

  return data as MandateRecord;
}

export async function updateMandate(id: string, input: MandateUpdateInput): Promise<MandateRecord> {
  const supabase = createBrowserClient();

  const payload: Record<string, unknown> = {};

  if (input.code !== undefined) payload.code = input.code.trim().toUpperCase();
  if (input.title !== undefined) payload.title = input.title.trim();
  if (input.description !== undefined) payload.description = input.description ? input.description : null;
  if (input.is_active !== undefined) payload.is_active = input.is_active;

  const { data, error } = await supabase
    .from('platform_mandates')
    .update(payload)
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    handleError(error);
  }

  return data as MandateRecord;
}

export async function deleteMandate(id: string): Promise<void> {
  const supabase = createBrowserClient();

  const { error } = await supabase.from('platform_mandates').delete().eq('id', id);

  if (error) {
    handleError(error);
  }
}
