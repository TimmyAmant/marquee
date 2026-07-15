type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

// Periodically drop expired buckets so this doesn't grow unbounded on a
// long-running self-hosted process.
setInterval(
  () => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (now > bucket.resetAt) buckets.delete(key);
    }
  },
  10 * 60 * 1000,
).unref?.();

/**
 * Simple in-memory fixed-window rate limiter. Good enough for a self-hosted,
 * single-process deployment; if this ever runs multi-instance, swap for a
 * shared store (e.g. Redis).
 */
export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (bucket.count >= limit) return false;
  bucket.count++;
  return true;
}

/** Read-only check — does not consume a slot. Use before doing expensive work
 * (like a password hash comparison) to reject early without penalizing a
 * legitimate request that hasn't failed yet. */
export function isRateLimited(key: string, limit: number): boolean {
  const bucket = buckets.get(key);
  if (!bucket || Date.now() > bucket.resetAt) return false;
  return bucket.count >= limit;
}

/** Records a failed attempt against the budget. Use only after confirming the
 * attempt actually failed (e.g. wrong password) — successful attempts should
 * never consume budget, or legitimate users get locked out by their own
 * normal usage. */
export function recordFailedAttempt(key: string, windowMs: number): void {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  bucket.count++;
}

export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}
