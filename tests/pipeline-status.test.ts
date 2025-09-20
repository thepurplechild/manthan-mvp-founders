import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const cookiesMock = vi.fn(() => ({
  getAll: () => [],
  set: () => undefined,
}));

vi.mock('next/headers', () => ({ cookies: cookiesMock }));

const fromMock = vi.fn();
const authGetUserMock = vi.fn(async () => ({ data: { user: { id: 'user-1' } } }));

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { getUser: authGetUserMock },
    from: fromMock,
  }),
}));

const stepsData = [
  { name: 'core_extraction', status: 'running', started_at: 'now', finished_at: null, output: null, error: null },
];

fromMock.mockImplementation((table: string) => {
  if (table === 'ingestions') {
    return {
      select: () => ({
        eq: () => ({ maybeSingle: () => ({ data: { id: 'ing-1', project_id: 'proj-1', status: 'processing', progress: 30, error: null }, error: null }) }),
        order: () => ({ limit: () => ({ maybeSingle: () => ({ data: { id: 'ing-1' }, error: null }) }) }),
      }),
    };
  }
  if (table === 'ingestion_steps') {
    return {
      select: () => ({
        eq: () => ({ order: () => ({ data: stepsData }) }),
      }),
    };
  }
  return {};
});

describe('pipeline status API', () => {
  it('returns aggregated status', async () => {
    const { GET } = require('@/app/api/pipeline-status/route');
    const req = NextRequest.from(new Request('https://example.com/api/pipeline-status?ingestionId=ing-1'));
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.ingestionId).toBe('ing-1');
    expect(body.data.steps).toHaveLength(1);
  });
});
