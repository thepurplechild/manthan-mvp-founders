import { kv } from '@vercel/kv';

export const PACKAGING_QUEUE_KEY = 'ai-packaging-queue' as const;

export type PackagingJob = {
  projectId: string;
  filePath: string;
  userId: string;
  enqueuedAt: string; // ISO 8601
};

function assertKvEnv() {
  const required = [
    'KV_URL',
    'KV_REST_API_URL',
    'KV_REST_API_TOKEN',
  ] as const;
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(`Missing Vercel KV env vars: ${missing.join(', ')}`);
  }
}

/**
 * Enqueue a packaging job onto the KV list (FIFO if workers lpop from the left).
 * Throws on failure.
 */
export async function enqueuePackagingJob(
  job: Omit<PackagingJob, 'enqueuedAt'>
): Promise<void> {
  assertKvEnv();
  const payload: PackagingJob = {
    ...job,
    enqueuedAt: new Date().toISOString(),
  };
  const serialized = JSON.stringify(payload);
  await kv.rpush(PACKAGING_QUEUE_KEY, serialized);
}
