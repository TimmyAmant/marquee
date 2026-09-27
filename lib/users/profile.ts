import { and, count, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { requests } from "@/lib/db/schema";
import { getHouseholdMember, type HouseholdMember } from "@/lib/users/household";
import { getQuotas, type QuotaState } from "@/lib/requests/quota";
import { getWatchlistShelfItems, hasWatchlistSync, type WatchlistShelfItem } from "@/lib/plex/watchlist-shelf";
import type { MediaType } from "@/lib/db/schema";

/** Titles on a profile's Plex Watchlist row. */
export const PROFILE_WATCHLIST_LENGTH = 20;

export type RequestCounts = { total: number; movie: number; tv: number };

/**
 * A member's profile page, after Seerr's: who they are, how many requests
 * they've made, how many they have left of each kind, and what's on their
 * Plex Watchlist. Yours, or (the admin) anyone's.
 */
export type MemberProfile = {
  member: HouseholdMember;
  requests: RequestCounts;
  /** Null for a type they aren't limited on. */
  limits: { movie: QuotaState | null; tv: QuotaState | null };
  /** Null when they don't sync a Plex Watchlist. */
  watchlist: WatchlistShelfItem[] | null;
};

/** Who may see whose profile: your own, or anyone's for the admin. */
export function canViewProfile(viewer: { userId: string; isAdmin: boolean }, targetId: string): boolean {
  return viewer.isAdmin || viewer.userId === targetId;
}

/** Totals from per-type counts (declined requests don't count, like the
 * request limits). */
export function requestCounts(rows: { mediaType: MediaType; count: number }[]): RequestCounts {
  const movie = rows.filter((r) => r.mediaType === "movie").reduce((sum, r) => sum + r.count, 0);
  const tv = rows.filter((r) => r.mediaType === "tv").reduce((sum, r) => sum + r.count, 0);
  return { total: movie + tv, movie, tv };
}

/** Null when there's no such account or the viewer may not see it. */
export async function loadMemberProfile(
  viewer: { userId: string; isAdmin: boolean; libraryOwnerId: string },
  targetId: string,
): Promise<MemberProfile | null> {
  if (!canViewProfile(viewer, targetId)) return null;
  const member = await getHouseholdMember(targetId);
  if (!member) return null;

  const [countRows, limits, syncsWatchlist] = await Promise.all([
    db
      .select({ mediaType: requests.mediaType, count: count() })
      .from(requests)
      .where(and(eq(requests.requestedByUserId, targetId), ne(requests.status, "rejected")))
      .groupBy(requests.mediaType),
    getQuotas(targetId),
    hasWatchlistSync(targetId),
  ]);
  const watchlist = syncsWatchlist
    ? await getWatchlistShelfItems(
        { userId: targetId, isAdmin: false, libraryOwnerId: viewer.libraryOwnerId },
        PROFILE_WATCHLIST_LENGTH,
      )
    : null;

  return { member, requests: requestCounts(countRows), limits, watchlist };
}
