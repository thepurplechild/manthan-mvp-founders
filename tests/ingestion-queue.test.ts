import { afterEach, describe, expect, it, vi } from 'vitest';

const zset: Array<{ score: number; member: string }> = [];

vi.mock('@vercel/kv', () => ({
  kv: {
    zadd: async (_key: string, entry: { score: number; member: string }) => {
      zset.push(entry);
      zset.sort((a, b) => a.score - b.score);
    },
    zpopmin: async (_key: string, count: number) => {
      const popped: Array<string | number> = [];
      for (let i = 0; i < count; i++) {
        const item = zset.shift();
        if (!item) break;
        popped.push(item.member, item.score);
      }
      return popped;
    },
    zrange: async (_key: string, start: number, end: number) => {
      return zset.slice(start, end === -1 ? undefined : end + 1).map((entry) => entry.member);
    },
    zrem: async (_key: string, member: string) => {
      const index = zset.findIndex((entry) => entry.member === member);
      if (index >= 0) zset.splice(index, 1);
    },
    zcard: async () => zset.length,
  },
}));

describe('ingestion queue', () => {
  afterEach(() => {
    zset.splice(0, zset.length);
  });

  it('enqueues and dequeues ingestion jobs in order', async () => {
    const { enqueueIngestionJob, dequeueIngestionJobs, ingestionQueueLength } = await import('@/lib/jobs/queue');

    await enqueueIngestionJob({ ingestionId: 'a', projectId: 'p1', userId: 'u' });
    await enqueueIngestionJob({ ingestionId: 'b', projectId: 'p2', userId: 'u' });

    expect(await ingestionQueueLength()).toBe(2);

    const first = await dequeueIngestionJobs(1);
    expect(first).toHaveLength(1);
    expect(first[0].ingestionId).toBe('a');

    const remaining = await dequeueIngestionJobs(5);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].ingestionId).toBe('b');
    expect(await ingestionQueueLength()).toBe(0);
  });

  it('re-enqueues job with incremented attempts', async () => {
    const { enqueueIngestionJob, dequeueIngestionJobs } = await import('@/lib/jobs/queue');

    await enqueueIngestionJob({ ingestionId: 'job-1', attempts: 0 });
    const [job] = await dequeueIngestionJobs(1);
    expect(job.attempts).toBe(0);

    await enqueueIngestionJob({ ingestionId: job.ingestionId, attempts: job.attempts + 1 });
    const [requeued] = await dequeueIngestionJobs(1);
    expect(requeued.attempts).toBe(1);
  });
});
