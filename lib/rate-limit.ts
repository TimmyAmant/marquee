type Bucket = { count: number; resetAt: number };

declare global {
  var __marqueeRateLimitBuckets: Map<string, Bucket> | undefined;
  var __marqueeRateLimitSlots: Map<string, number> | undefined;
  var __marqueeRateLimitSweeper: boolean | undefined;
}

// Stored on globalThis rather than as plain module state: Next.js can load a
// module more than once in the same process (e.g. once for server actions,
// once for route handlers), and the web sign-in and the /api/v1 login must
// count failures against the very same buckets.
const buckets: Map<string, Bucket> = (globalThis.__marqueeRateLimitBuckets ??= new Map());
// Per-key "next free slot" times for reserveSlot — same reasoning.
const slots: Map<string, number> = (globalThis.__marqueeRateLimitSlots ??= new Map());

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
      for (const [key, freeAt] of slots) {
        if (now > freeAt) slots.delete(key);
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

/** Like checkRateLimit, but one call spends `amount` of the budget at once
 * (e.g. one share to three people is three). All or nothing: when the
 * whole amount doesn't fit, nothing is spent and it returns false. */
export function consumeRateLimit(key: string, amount: number, limit: number, windowMs: number): boolean {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }
  if (bucket.count + amount > limit) return false;
  bucket.count += amount;
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
 * normal usage. (Or record it up front and `refundAttempt` on success, when
 * the check itself is slow enough that parallel attempts could all pass
 * `isRateLimited` before any failure lands.) */
export function recordFailedAttempt(key: string, windowMs: number): void {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  bucket.count++;
}

/** Gives back one attempt recorded up front for a check that then succeeded,
 * so a correct password costs nothing. A window that already expired has
 * nothing to give back. */
export function refundAttempt(key: string): void {
  const bucket = buckets.get(key);
  if (!bucket || Date.now() > bucket.resetAt) return;
  if (bucket.count > 0) bucket.count--;
}

/** How many attempts the key's current window has recorded (0 once it has
 * expired). */
export function attemptCount(key: string): number {
  const bucket = buckets.get(key);
  if (!bucket || Date.now() > bucket.resetAt) return 0;
  return bucket.count;
}

/** Books the key's next free slot and returns how long the caller has to
 * wait for it (0 when the key is idle); the slot after it opens `spacingMs`
 * later. A queue rather than a refusal: callers are slowed down to one per
 * `spacingMs` however many arrive at once, but nobody is turned away. */
export function reserveSlot(key: string, spacingMs: number): number {
  const now = Date.now();
  const start = Math.max(now, slots.get(key) ?? 0);
  slots.set(key, start + spacingMs);
  return start - now;
}

/** The number of reverse proxies in front of Marquee that each append the
 * address they saw to X-Forwarded-For — TRUSTED_PROXY_HOPS, default 0. */
export function trustedProxyHops(): number {
  const hops = Number(process.env.TRUSTED_PROXY_HOPS ?? "0");
  return Number.isInteger(hops) && hops > 0 ? hops : 0;
}

/**
 * The client address rate limits are keyed on, or null when it can't be
 * known. Next.js only fills X-Forwarded-For from the socket when the request
 * arrived without one, and route handlers never see the socket themselves —
 * so with no proxy in front, the header is whatever the client chose to send
 * and says nothing. Only when TRUSTED_PROXY_HOPS proxies are configured is an
 * entry trustworthy: the one the outermost of them appended, counting from
 * the end (everything before it is client-supplied). A header shorter than
 * that didn't come through the proxies at all. X-Real-IP is never consulted:
 * nothing guarantees a proxy overwrote it.
 *
 * Callers that need a bucket regardless use one shared one for null (e.g.
 * `getClientIp(request) ?? "unknown"`) rather than trusting the header.
 */
export function getClientIp(source: Request | Headers): string | null {
  const hops = trustedProxyHops();
  if (hops === 0) return null;
  const headers = source instanceof Request ? source.headers : source;
  const forwardedFor = headers.get("x-forwarded-for");
  if (!forwardedFor) return null;
  const entries = forwardedFor.split(",").map((entry) => entry.trim()).filter(Boolean);
  return entries.length >= hops ? entries[entries.length - hops] : null;
}
