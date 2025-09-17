type RecordEntry = { count: number; resetAt: number }
const buckets = new Map<string, RecordEntry>()

export function rateLimit(key: string, limit = 20, windowMs = 60000) {
  const now = Date.now()
  const rec = buckets.get(key)
  if (!rec || rec.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, remaining: limit - 1, retryAfter: 0 }
  }
  if (rec.count >= limit) {
    return { allowed: false, remaining: 0, retryAfter: rec.resetAt - now }
  }
  rec.count += 1
  return { allowed: true, remaining: limit - rec.count, retryAfter: rec.resetAt - now }
}

