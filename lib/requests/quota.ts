import { and, eq, gte, ne } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { requests, users, type MediaType } from "@/lib/db/schema";
import { hasRequestLimits } from "@/lib/users/roles";

// Request limits: a member may be allowed, say, 5 movies in any 7 days
// (set per member by the admin). Every request that wasn't declined counts —
// regular, 4K, a season request and a Plex Watchlist one alike — and a slot
// comes back once its request is `days` old. Admins and trusted members are
// never limited.

const DAY_MS = 24 * 60 * 60 * 1000;
export const MAX_QUOTA_DAYS = 365;
export const MAX_QUOTA_LIMIT = 1000;

export type QuotaState = {
  limit: number;
  days: number;
  used: number;
  remaining: number;
  /** When the next slot frees up, while none is left; null otherwise. */
  nextSlotAt: Date | null;
};

/** Pure; unit tested. `createdAts`: the counted requests in the window. */
export function computeQuota(limit: number, days: number, createdAts: Date[], now: Date): QuotaState {
  const since = now.getTime() - days * DAY_MS;
  const counted = createdAts.filter((d) => d.getTime() > since).sort((a, b) => a.getTime() - b.getTime());
  const used = counted.length;
  const remaining = Math.max(0, limit - used);
  // The slot that frees first is the (used - limit + 1)-th oldest.
  const freeing = remaining === 0 ? counted[used - limit] : undefined;
  return {
    limit,
    days,
    used,
    remaining,
    nextSlotAt: freeing ? new Date(freeing.getTime() + days * DAY_MS) : null,
  };
}

/** "in 3 days", "in 5 hours", "in a few minutes" — relative, so it reads
 * right whatever time zone the server and the member are in. Pure. */
export function untilLabel(when: Date, now: Date): string {
  const ms = when.getTime() - now.getTime();
  const hours = Math.ceil(ms / (60 * 60 * 1000));
  if (hours <= 1) return "within the hour";
  if (hours < 24) return `in ${hours} hours`;
  const days = Math.ceil(ms / DAY_MS);
  return days === 1 ? "tomorrow" : `in ${days} days`;
}

/** The refusal, in words. Pure; unit tested. */
export function quotaExceededMessage(mediaType: MediaType, quota: QuotaState, now = new Date()): string {
  const what = mediaType === "movie" ? (quota.limit === 1 ? "movie request" : "movie requests") : quota.limit === 1 ? "TV request" : "TV requests";
  const span = quota.days === 1 ? "a day" : quota.days === 7 ? "a week" : `${quota.days} days`;
  const when = quota.nextSlotAt ? ` You can ask again ${untilLabel(quota.nextSlotAt, now)}.` : "";
  return `You've used your ${quota.limit} ${what} for ${span}.${when}`;
}

type LimitColumns = {
  role: string;
  movieQuotaLimit: number | null;
  movieQuotaDays: number;
  tvQuotaLimit: number | null;
  tvQuotaDays: number;
};

/** This member's limit for the type, with how much is used; null when
 * they aren't limited. */
export async function getQuota(userId: string, mediaType: MediaType, now = new Date()): Promise<QuotaState | null> {
  const [user] = await db
    .select({
      role: users.role,
      movieQuotaLimit: users.movieQuotaLimit,
      movieQuotaDays: users.movieQuotaDays,
      tvQuotaLimit: users.tvQuotaLimit,
      tvQuotaDays: users.tvQuotaDays,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return user ? getQuotaFor(userId, user, mediaType, now) : null;
}

export async function getQuotaFor(
  userId: string,
  user: LimitColumns,
  mediaType: MediaType,
  now = new Date(),
): Promise<QuotaState | null> {
  if (!hasRequestLimits(user.role)) return null;
  const limit = mediaType === "movie" ? user.movieQuotaLimit : user.tvQuotaLimit;
  const days = mediaType === "movie" ? user.movieQuotaDays : user.tvQuotaDays;
  if (limit === null) return null;
  const rows = await db
    .select({ createdAt: requests.createdAt })
    .from(requests)
    .where(
      and(
        eq(requests.requestedByUserId, userId),
        eq(requests.mediaType, mediaType),
        ne(requests.status, "rejected"),
        gte(requests.createdAt, new Date(now.getTime() - days * DAY_MS)),
      ),
    );
  return computeQuota(limit, days, rows.map((r) => r.createdAt), now);
}

/** Both types at once, for /me and the member's Requests page. */
export async function getQuotas(userId: string, now = new Date()) {
  const [movie, tv] = await Promise.all([getQuota(userId, "movie", now), getQuota(userId, "tv", now)]);
  return { movie, tv };
}

declare global {
  var __marqueeQuotaLocks: Map<string, Promise<unknown>> | undefined;
}

// On globalThis like the other in-process locks (lib/async/single-flight.ts):
// Next.js can load this module more than once.
const locks: Map<string, Promise<unknown>> = (globalThis.__marqueeQuotaLocks ??= new Map());

/**
 * Checks this member's limit for the type and runs `insert` only if a slot
 * is free — one at a time per member and type, so two requests sent at once
 * can't both take the last slot. Unlimited members skip straight to it.
 */
export async function insertWithinQuota<T>(
  userId: string,
  mediaType: MediaType,
  insert: () => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  const key = `${userId}:${mediaType}`;
  const previous = locks.get(key) ?? Promise.resolve();
  const run = previous
    .catch(() => undefined)
    .then(async () => {
      const quota = await getQuota(userId, mediaType);
      if (quota && quota.remaining === 0) return { ok: false as const, error: quotaExceededMessage(mediaType, quota) };
      return { ok: true as const, value: await insert() };
    });
  locks.set(key, run);
  try {
    return await run;
  } finally {
    if (locks.get(key) === run) locks.delete(key);
  }
}
