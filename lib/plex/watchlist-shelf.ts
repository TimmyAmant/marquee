import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { plexWatchlistItems, plexWatchlists, titles, users, type MediaType } from "@/lib/db/schema";
import { getEpisodeCountMap, getLibraryStatusMap } from "@/lib/library/query";
import type { EpisodeCounts } from "@/lib/library/episode-counts";
import type { LibraryStatus } from "@/components/status-badge";
import type { ViewerIdentity } from "@/lib/integrations/library-owner";

/** One title on Discover's "Your Watchlist" row. */
export type WatchlistShelfItem = {
  mediaType: MediaType;
  tmdbId: number;
  name: string;
  posterPath: string | null;
  year: string | null;
  status?: LibraryStatus;
  /** Series in the library: have/total aired episodes. */
  episodes?: EpisodeCounts | null;
  /** When the sync first saw it on the watchlist. */
  addedAt: Date;
};

/** Titles per page of the row's See all. */
export const WATCHLIST_PAGE_SIZE = 40;

/** Whether the viewer has "Request from my Plex Watchlist" on — the row
 * only shows then (lib/plex/watchlist.ts). */
export async function hasWatchlistSync(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ plexUserId: plexWatchlists.plexUserId, linked: users.plexUserId })
    .from(plexWatchlists)
    .innerJoin(users, eq(users.id, plexWatchlists.userId))
    .where(and(eq(plexWatchlists.userId, userId), isNotNull(plexWatchlists.authTokenEnc)))
    .limit(1);
  return Boolean(row && row.linked && row.plexUserId === row.linked);
}

/**
 * The viewer's Plex Watchlist as the sync has seen it (plex_watchlist_items:
 * every title it handled, newest first), with each title's poster from the
 * titles cache and its library status. Empty when the sync is off. Only
 * `limit` newest; `offset` for the See all's pages.
 */
export async function getWatchlistShelfItems(
  viewer: ViewerIdentity,
  limit: number,
  offset = 0,
): Promise<WatchlistShelfItem[]> {
  if (!viewer.userId || !(await hasWatchlistSync(viewer.userId))) return [];
  const rows = await db
    .select({
      mediaType: plexWatchlistItems.mediaType,
      tmdbId: plexWatchlistItems.tmdbId,
      addedAt: plexWatchlistItems.createdAt,
      name: titles.name,
      posterPath: titles.posterPath,
      releaseDate: titles.releaseDate,
      firstAirDate: titles.firstAirDate,
    })
    .from(plexWatchlistItems)
    .innerJoin(titles, and(eq(titles.mediaType, plexWatchlistItems.mediaType), eq(titles.tmdbId, plexWatchlistItems.tmdbId)))
    .where(and(eq(plexWatchlistItems.userId, viewer.userId), inArray(plexWatchlistItems.outcome, ["requested", "skipped"])))
    .orderBy(desc(plexWatchlistItems.createdAt), desc(plexWatchlistItems.tmdbId))
    .limit(limit)
    .offset(offset);
  const [statusMap, episodeCounts] = viewer.libraryOwnerId
    ? await Promise.all([
        getLibraryStatusMap(viewer.libraryOwnerId, rows),
        getEpisodeCountMap(viewer.libraryOwnerId, rows),
      ])
    : [new Map<string, LibraryStatus>(), new Map<string, EpisodeCounts>()];
  return rows.map((row) => ({
    mediaType: row.mediaType,
    tmdbId: row.tmdbId,
    name: row.name,
    posterPath: row.posterPath,
    year: (row.releaseDate || row.firstAirDate || "").slice(0, 4) || null,
    status: statusMap.get(`${row.mediaType}:${row.tmdbId}`),
    episodes: episodeCounts.get(`${row.mediaType}:${row.tmdbId}`) ?? null,
    addedAt: row.addedAt,
  }));
}
