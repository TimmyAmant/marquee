type Bucket = { count: number; resetAt: number };

declare global {
  var __marqueeRateLimitBuckets: Map<string, Bucket> | undefined;
  var __marqueeRateLimitSweeper: boolean | undefined;
}

// Stored on globalThis rather than as plain module state: Next.js can load a
// module more than once in the same process (e.g. once for server actions,
// once for route handlers), and the web sign-in and the /api/v1 login must
// count failures against the very same buckets.
const buckets: Map<string, Bucket> = (globalThis.__marqueeRateLimitBuckets ??= new Map());

// Periodically drop expired buckets so this doesn't grow unbounded on a
// long-running self-hosted process.
if (!globalThis.__marqueeRateLimitSweeper) {
  globalThis.__marqueeRateLimitSweeper = true;
  setInterval(
    () => {
      const now = Date.now();
      for (const [key, bucket] of buckets) {
        if (now > bucket.resetAt) buckets.delete(key);
      }
    },
    10 * 60 * 1000,
  ).unref?.();
}

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

/**
 * The address rate limits are keyed on: the LAST X-Forwarded-For hop — the
 * one the nearest proxy (Cloudflare, nginx, Caddy) appended — never the
 * first: a client can put anything it likes at the front of that header, so
 * keying on the first hop let anyone dodge the login limit by changing it
 * on every attempt. A request with no proxy in front can still send a fake
 * header, but that's only reachable from the LAN.
 */
export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const hops = forwardedFor.split(",").map((hop) => hop.trim()).filter(Boolean);
    if (hops.length > 0) return hops[hops.length - 1];
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}
