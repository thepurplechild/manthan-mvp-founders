import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const kvStore: Record<string, unknown> = {};

vi.mock('@vercel/kv', () => ({
  kv: {
    set: vi.fn(async (key: string, value: string, opts: Record<string, unknown>) => {
      if (opts?.nx && kvStore[key]) return null;
      kvStore[key] = value;
      return 'OK';
    }),
    del: vi.fn(async (key: string) => {
      delete kvStore[key];
    }),
  },
}));

const enqueueIngestionJob = vi.fn();
const dequeueIngestionJobs = vi.fn();
const ingestionQueueLength = vi.fn(async () => 0);

vi.mock('@/lib/jobs/queue', () => ({
  enqueueIngestionJob: (...args: unknown[]) => enqueueIngestionJob(...args),
  dequeueIngestionJobs: (...args: unknown[]) => dequeueIngestionJobs(...args),
  ingestionQueueLength: (...args: unknown[]) => ingestionQueueLength(...args),
}));

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

describe('cron processor', () => {
  const { POST } = require('@/app/api/cron/process-jobs/route');
  const origin = 'https://example.com/api/cron/process-jobs';

  beforeEach(() => {
    enqueueIngestionJob.mockReset();
    dequeueIngestionJobs.mockReset();
    ingestionQueueLength.mockReset();
    fetchMock.mockReset();
    process.env.CRON_SECRET = 'secret';
  });

  afterEach(() => {
    for (const key of Object.keys(kvStore)) delete kvStore[key];
  });

  it('skips when lock already held', async () => {
    const { kv } = require('@vercel/kv');
    kv.set.mockResolvedValueOnce(null);
    const req = NextRequest.from(new Request(origin, {
      method: 'POST',
      headers: { 'x-cron-secret': 'secret' },
    }));

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.message).toMatch(/Lock/);
  });

  it('processes dequeued jobs and calls run endpoint', async () => {
    dequeueIngestionJobs.mockResolvedValueOnce([
      { ingestionId: 'abc', attempts: 0, queueId: 'q1' },
    ]);
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }));

    const req = NextRequest.from(new Request(origin, {
      method: 'POST',
      headers: { 'x-cron-secret': 'secret' },
    }));

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0];
    expect(call[0]).toContain('/api/ingestions/run');
    expect(JSON.parse(call[1].body as string).ingestionId).toBe('abc');
  });

  it('re-enqueues job on processor failure', async () => {
    dequeueIngestionJobs.mockResolvedValueOnce([
      { ingestionId: 'abc', attempts: 1, queueId: 'q1' },
    ]);
    fetchMock.mockResolvedValueOnce(new Response('boom', { status: 500 }));

    const req = NextRequest.from(new Request(origin, {
      method: 'POST',
      headers: { 'x-cron-secret': 'secret' },
    }));

    await POST(req);
    expect(enqueueIngestionJob).toHaveBeenCalled();
  });
});
