import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const updateMock = vi.fn();
const selectMock = vi.fn();
const downloadMock = vi.fn();
const uploadMock = vi.fn();

const supabaseMock = {
  from: (table: string) => {
    if (table === 'ingestions') {
      return {
        select: () => ({ eq: () => ({ maybeSingle: () => ({ data: { id: 'ing-1', project_id: 'proj', user_id: 'user', source_file_url: 'scripts/user/file.pdf', mime_type: 'application/pdf', progress: 0, status: 'queued' }, error: null }) }) }),
        update: (payload: unknown) => ({ eq: () => { updateMock(table, payload); return { error: null }; } }),
      };
    }
    if (table === 'ingestion_steps') {
      return {
        select: () => ({ eq: () => ({ order: () => ({ data: [] }) }) }),
        update: (payload: unknown) => ({ eq: () => ({ error: null, data: updateMock(table, payload) }) }),
        insert: () => ({ data: null, error: null }),
      };
    }
    return { update: () => ({ error: null }), select: () => ({}) };
  },
  storage: {
    from: (bucket: string) => {
      if (bucket === 'scripts') {
        return {
          download: downloadMock,
        };
      }
      return {
        upload: uploadMock,
      };
    },
  },
};

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => supabaseMock,
}));

vi.mock('@/lib/ingestion/core', () => ({
  ingestFile: vi.fn(async () => ({ content: { textContent: 'script text', metadata: { title: 'Title' }, contentType: 'text/plain' } })),
}));

vi.mock('@/lib/ai/anthropic', () => ({
  callClaude: vi.fn(async () => ({ text: JSON.stringify({ logline: 'Logline', synopsis: 'Synopsis', themes: ['theme'], characters: [] }) })),
  safeParseJSON: vi.fn((text: string) => JSON.parse(text)),
}));

vi.mock('@/lib/generation/documents', () => ({
  generatePitchPDF: vi.fn(async () => Buffer.from('pdf')),
  generatePitchPPTX: vi.fn(async () => Buffer.from('pptx')),
  generateSummaryDOCX: vi.fn(async () => Buffer.from('docx')),
  PitchData: {} as never,
}));

vi.mock('@/lib/generation/visuals', () => ({
  generateVisualBrief: vi.fn(async () => ({ concepts: [] })),
  maybeGenerateImages: vi.fn(async () => []),
}));

describe('ingestion run endpoint', () => {
  beforeEach(() => {
    updateMock.mockReset();
    downloadMock.mockResolvedValue({ arrayBuffer: async () => new ArrayBuffer(8) });
    uploadMock.mockResolvedValue({ error: null });
    process.env.CRON_SECRET = 'secret';
  });

  it('rejects unauthorized requests', async () => {
    const { POST } = require('@/app/api/ingestions/run/route');
    const req = NextRequest.from(new Request('https://example.com/api/ingestions/run', { method: 'POST', body: JSON.stringify({ ingestionId: 'ing-1' }) }));
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('processes ingestion successfully', async () => {
    const { POST } = require('@/app/api/ingestions/run/route');
    const req = NextRequest.from(new Request('https://example.com/api/ingestions/run', {
      method: 'POST',
      headers: { 'x-cron-secret': 'secret' },
      body: JSON.stringify({ ingestionId: 'ing-1' }),
    }));

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(updateMock).toHaveBeenCalled();
  });
});
