import type { PostgrestError } from '@supabase/supabase-js';

import { createBrowserClient } from '@/lib/supabase/browser-client';
import {
  DealStatusSchema,
  FeedbackInputSchema,
  OutreachInputSchema,
  OUTREACH_PAGE_SIZE,
  type DealStatus,
  type FeedbackInput,
  type OutreachInput,
} from './deal-schema';

export interface DealMetaRecord {
  project_id: string;
  status: DealStatus;
  feedback: string | null;
  updated_at: string;
}

export interface OutreachRecord {
  id: string;
  project_id: string;
  channel: string;
  contact: string | null;
  note: string;
  next_follow_up_at: string | null;
  created_by: string;
  created_at: string;
}

export interface ListOutreachOptions {
  limit?: number;
  offset?: number;
  search?: string;
  signal?: AbortSignal;
}

function raise(error: PostgrestError): never {
  throw new Error(error.message || 'Supabase request failed');
}

export async function getDealMeta(projectId: string): Promise<DealMetaRecord> {
  const supabase = createBrowserClient();
  const { data, error } = await supabase
    .from('project_deal_meta')
    .select('project_id,status,feedback,updated_at')
    .eq('project_id', projectId)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    raise(error);
  }

  if (!data) {
    const now = new Date().toISOString();
    return {
      project_id: projectId,
      status: DealStatusSchema.parse('lead'),
      feedback: null,
      updated_at: now,
    };
  }

  return {
    project_id: data.project_id,
    status: DealStatusSchema.parse(data.status ?? 'lead'),
    feedback: (data.feedback as string | null) ?? null,
    updated_at: data.updated_at ?? new Date().toISOString(),
  };
}

export async function updateDealStatus(projectId: string, status: DealStatus): Promise<DealMetaRecord> {
  const supabase = createBrowserClient();
  const validated = DealStatusSchema.parse(status);
  const payload = {
    project_id: projectId,
    status: validated,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('project_deal_meta')
    .upsert(payload, { onConflict: 'project_id' })
    .select('project_id,status,feedback,updated_at')
    .single();

  if (error) {
    raise(error);
  }

  return {
    project_id: data.project_id,
    status: DealStatusSchema.parse(data.status ?? validated),
    feedback: (data.feedback as string | null) ?? null,
    updated_at: data.updated_at ?? payload.updated_at,
  };
}

export async function updateDealFeedback(projectId: string, input: FeedbackInput): Promise<DealMetaRecord> {
  const supabase = createBrowserClient();
  const parsed = FeedbackInputSchema.parse(input);
  const payload = {
    project_id: projectId,
    feedback: parsed.feedback ? parsed.feedback : null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('project_deal_meta')
    .upsert(payload, { onConflict: 'project_id' })
    .select('project_id,status,feedback,updated_at')
    .single();

  if (error) {
    raise(error);
  }

  return {
    project_id: data.project_id,
    status: DealStatusSchema.parse(data.status ?? 'lead'),
    feedback: (data.feedback as string | null) ?? null,
    updated_at: data.updated_at ?? payload.updated_at,
  };
}

export async function listOutreach(
  projectId: string,
  { limit = OUTREACH_PAGE_SIZE, offset = 0, search, signal }: ListOutreachOptions = {}
): Promise<{ data: OutreachRecord[]; count: number }> {
  const supabase = createBrowserClient();

  let query = supabase
    .from('project_outreach_logs')
    .select('id,project_id,channel,contact,note,next_follow_up_at,created_by,created_at', {
      count: 'exact',
    })
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (signal) {
    query = query.abortSignal(signal);
  }

  if (search && search.trim()) {
    const value = `%${search.trim()}%`;
    query = query.or(`contact.ilike.${value},note.ilike.${value}`);
  }

  const { data, error, count } = await query;

  if (error) {
    raise(error);
  }

  return {
    data: (data ?? []) as OutreachRecord[],
    count: count ?? 0,
  };
}

export async function createOutreach(projectId: string, input: OutreachInput): Promise<OutreachRecord> {
  const supabase = createBrowserClient();
  const parsed = OutreachInputSchema.parse(input);

  const payload = {
    project_id: projectId,
    channel: parsed.channel,
    contact: parsed.contact ? parsed.contact : null,
    note: parsed.note,
    next_follow_up_at: parsed.next_follow_up_at ?? null,
  };

  const { data, error } = await supabase
    .from('project_outreach_logs')
    .insert(payload)
    .select('id,project_id,channel,contact,note,next_follow_up_at,created_by,created_at')
    .single();

  if (error) {
    raise(error);
  }

  return data as OutreachRecord;
}
// *** End Patch
