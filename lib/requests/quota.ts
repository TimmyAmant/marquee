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

/** "Oct 2" — when a limited member can ask again. */
function shortDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** The refusal, in words. Pure; unit tested. */
export function quotaExceededMessage(mediaType: MediaType, quota: QuotaState): string {
  const what = mediaType === "movie" ? (quota.limit === 1 ? "movie request" : "movie requests") : quota.limit === 1 ? "TV request" : "TV requests";
  const span = quota.days === 1 ? "a day" : quota.days === 7 ? "a week" : `${quota.days} days`;
  const when = quota.nextSlotAt ? ` You can ask again on ${shortDate(quota.nextSlotAt)}.` : "";
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
