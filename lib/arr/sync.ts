import { and, eq, inArray, isNull, notInArray, or } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { runExclusive, singleFlight, whenIdle } from "@/lib/async/single-flight";
import { arrStatusCache } from "@/lib/db/schema";
import type { ArrProvider } from "@/lib/db/schema";
import { IntegrationDisconnectedError } from "@/lib/integrations/credentials";
import { deriveRadarrStatus, deriveSonarrStatus } from "@/lib/integrations/arr-status-logic";
import type { LibraryStatus } from "@/components/status-badge";
import * as sonarr from "@/lib/sonarr/client";
import * as radarr from "@/lib/radarr/client";
import { getOrFetchTitle } from "@/lib/tmdb/cache";
import { lookupTmdbIdFromTvdbId } from "@/lib/tmdb/cross-reference";
import { applyTmdbIdOverride } from "@/lib/library/title-overrides";
import { arrConfig, listLibraryServers, ownersWithLibraryServers, type ArrServer } from "@/lib/arr/servers";
import { mergeServerCopies, type ServerCopy } from "@/lib/arr/merge";
import { statusRank } from "@/lib/arr/fan-out";

// The library cache (arr_status_cache) for Sonarr/Radarr: one row per title
// across every standard (non-4K) server of that kind. Each server is listed
// in parallel; a title more than one of them has gets the furthest-along
// copy (owned beats downloading beats wanted — lib/arr/merge.ts), the
// default server winning a tie. The 4K servers aren't part of the library
// (lib/arr/fourk.ts).

/** How many titles to write between checks that the servers are unchanged. */
const CONNECTED_CHECK_EVERY = 100;

type RowFields = {
  arrId: number;
  status: LibraryStatus;
  monitored: boolean;
  sizeBytes: number | null;
  filePath: string | null;
  qualityCutoffNotMet?: boolean | null;
  qualityName?: string | null;
  dynamicRange?: string | null;
  audioCodec?: string | null;
};

/** Throws when this kind's standard servers are no longer the ones this run
 * started with (one was removed, added or moved to 4K): a server removed
 * mid-run must not have its titles written back, and a later run — which
 * the change itself starts — reads the new set. */
async function assertSameServers(userId: string, kind: ArrProvider, ids: readonly string[]): Promise<void> {
  const now = await listLibraryServers(userId, kind);
  const same = now.length === ids.length && now.every((s) => ids.includes(s.id));
  if (!same) throw new IntegrationDisconnectedError(kind);
}

type Listing<T> = { server: ArrServer; items: T[]; queued: Set<number> } | { server: ArrServer; failed: unknown };

async function listEach<T>(
  servers: ArrServer[],
  list: (server: ArrServer) => Promise<T[]>,
  queue: (server: ArrServer) => Promise<Set<number>>,
): Promise<Listing<T>[]> {
  return Promise.all(
    servers.map(async (server) => {
      try {
        const [items, queued] = await Promise.all([
          list(server),
          queue(server).catch(() => new Set<number>()),
        ]);
        return { server, items, queued };
      } catch (failed) {
        return { server, failed };
      }
    }),
  );
}

async function runSyncArrLibrary(userId: string, kind: ArrProvider): Promise<{ count: number }> {
  const servers = await listLibraryServers(userId, kind);
  if (servers.length === 0) throw new Error(`${kind} is not connected for this user`);
  const serverIds = servers.map((s) => s.id);

  const copies: ServerCopy<RowFields>[] = [];
  let failedLookupCount = 0;
  let listings: Listing<unknown>[];

  if (kind === "radarr") {
    const movieListings = await listEach(
      servers,
      (s) => radarr.getAllMovies(arrConfig(s)),
      (s) => radarr.getQueuedMovieIds(arrConfig(s)),
    );
    listings = movieListings;
    const overrides = new Map<number, number>();
    for (const listing of movieListings) {
      if (!("items" in listing)) continue;
      for (const movie of listing.items) {
        let tmdbId = overrides.get(movie.tmdbId);
        if (tmdbId === undefined) {
          tmdbId = await applyTmdbIdOverride(userId, "movie", movie.tmdbId).catch(() => movie.tmdbId);
          overrides.set(movie.tmdbId, tmdbId);
        }
        // The queue is real-time; file count/monitored flags only reflect the
        // last sync, so a movie mid-download (no file yet) would otherwise
        // show as merely "monitored" until the download completes.
        const status = listing.queued.has(movie.id) ? "tracked_downloading" : deriveRadarrStatus(movie);
        copies.push({
          serverId: listing.server.id,
          tmdbId,
          fields: {
            arrId: movie.id,
            status,
            monitored: movie.monitored,
            sizeBytes: movie.movieFile?.size ?? null,
            filePath: movie.movieFile?.path ?? movie.path ?? null,
            qualityCutoffNotMet: movie.movieFile?.qualityCutoffNotMet ?? null,
            qualityName: movie.movieFile?.quality?.quality?.name ?? null,
            dynamicRange: movie.movieFile?.mediaInfo?.videoDynamicRangeType || null,
            audioCodec: movie.movieFile?.mediaInfo?.audioCodec || null,
          },
        });
      }
    }
  } else {
    const seriesListings = await listEach(
      servers,
      (s) => sonarr.getAllSeries(arrConfig(s)),
      (s) => sonarr.getQueuedSeriesIds(arrConfig(s)),
    );
    listings = seriesListings;
    const resolved = new Map<number, number | null>();
    for (const listing of seriesListings) {
      if (!("items" in listing)) continue;
      for (const series of listing.items) {
        let tmdbId = resolved.get(series.tvdbId);
        if (tmdbId === undefined) {
          const lookup = await lookupTmdbIdFromTvdbId(series.tvdbId);
          // A failed lookup (e.g. TMDb briefly unreachable) means this series
          // may well have a cached row from an earlier run, so the cleanup
          // below has to sit this one out. A series TMDb simply has no match
          // for never had a row to begin with, so it doesn't block cleanup —
          // otherwise one obscure show would switch cleanup off for good.
          if (!lookup.tmdbId && lookup.failed) failedLookupCount++;
          tmdbId = lookup.tmdbId
            ? await applyTmdbIdOverride(userId, "tv", lookup.tmdbId).catch(() => lookup.tmdbId!)
            : null;
          resolved.set(series.tvdbId, tmdbId);
        }
        if (!tmdbId) continue;
        // The queue is real-time; episode-file-count statistics only reflect
        // the last sync and don't move until an episode finishes importing.
        const status = listing.queued.has(series.id) ? "tracked_downloading" : deriveSonarrStatus(series);
        copies.push({
          serverId: listing.server.id,
          tmdbId,
          fields: {
            arrId: series.id,
            status,
            monitored: series.monitored,
            sizeBytes: series.statistics?.sizeOnDisk ?? null,
            filePath: series.path ?? null,
          },
        });
      }
    }
  }

  const failedServers = listings.filter((l) => "failed" in l).map((l) => l.server.id);
  if (failedServers.length === servers.length) {
    const first = listings.find((l) => "failed" in l) as { failed: unknown };
    throw first.failed instanceof Error ? first.failed : new Error(`Couldn't reach ${kind}`);
  }

  // A server that didn't answer this time keeps its titles: where the
  // cached row came from it and is further along than what the servers that
  // did answer say, it stays as it is rather than being downgraded.
  const keep = new Map<number, string | null>();
  if (failedServers.length > 0) {
    const rows = await db
      .select({ externalId: arrStatusCache.externalId, status: arrStatusCache.status, serverId: arrStatusCache.serverId })
      .from(arrStatusCache)
      .where(
        and(
          eq(arrStatusCache.userId, userId),
          eq(arrStatusCache.provider, kind),
          inArray(arrStatusCache.serverId, failedServers),
        ),
      );
    for (const row of rows) keep.set(row.externalId, row.status);
  }

  const merged = mergeServerCopies(copies, serverIds);
  await assertSameServers(userId, kind, serverIds);

  let count = 0;
  const seenTmdbIds: number[] = [];
  for (const [index, { tmdbId, serverId, fields }] of merged.entries()) {
    if (index > 0 && index % CONNECTED_CHECK_EVERY === 0) await assertSameServers(userId, kind, serverIds);
    seenTmdbIds.push(tmdbId);
    if (keep.has(tmdbId) && statusRank(keep.get(tmdbId)) > statusRank(fields.status)) continue;
    await getOrFetchTitle(kind === "radarr" ? "movie" : "tv", tmdbId).catch(() => null);
    const values = { ...fields, serverId, checkedAt: new Date() };
    await db
      .insert(arrStatusCache)
      .values({ userId, provider: kind, externalId: tmdbId, ...values })
      .onConflictDoUpdate({
        target: [arrStatusCache.userId, arrStatusCache.provider, arrStatusCache.externalId],
        set: values,
      });
    count++;
  }

  // Titles removed from every server (outside Marquee) won't appear above —
  // drop their cached rows so they don't linger as "still tracked". Every
  // row goes except one from a server that didn't answer this time: rows
  // from a server that answered, from one since removed (null), and from
  // one no longer in the library — moved to 4K, whose copies mustn't count
  // as the library. A Sonarr series whose TMDb lookup failed this run skips
  // cleanup entirely, since `seenTmdbIds` would then be an incomplete picture.
  if (failedLookupCount === 0) {
    await assertSameServers(userId, kind, serverIds);
    const fromAnsweredServer =
      failedServers.length > 0
        ? or(isNull(arrStatusCache.serverId), notInArray(arrStatusCache.serverId, failedServers))
        : undefined;
    await db
      .delete(arrStatusCache)
      .where(
        and(
          eq(arrStatusCache.userId, userId),
          eq(arrStatusCache.provider, kind),
          fromAnsweredServer,
          ...(seenTmdbIds.length > 0 ? [notInArray(arrStatusCache.externalId, seenTmdbIds)] : []),
        ),
      );
  }

  return { count };
}

const AUTO_SYNC_STALE_MS = 15 * 60 * 1000;

declare global {
  var __marqueeArrSyncAttempts: Map<string, number> | undefined;
}

// When each user's Sonarr/Radarr last had an on-visit sync attempted. The
// cache rows' checkedAt can't answer that for an empty library (there are
// no rows) or a failing one (nothing gets written), and without this every
// page visit in either case would kick off another full sync.
const lastAttemptAt: Map<string, number> = (globalThis.__marqueeArrSyncAttempts ??= new Map());

export async function syncArrLibraryIfStale(userId: string): Promise<void> {
  for (const kind of ["sonarr", "radarr"] as const) {
    const servers = await listLibraryServers(userId, kind);
    if (servers.length === 0) continue;

    const [row] = await db
      .select({ checkedAt: arrStatusCache.checkedAt })
      .from(arrStatusCache)
      .where(and(eq(arrStatusCache.userId, userId), eq(arrStatusCache.provider, kind)))
      .limit(1);

    const attemptKey = `${kind}:${userId}`;
    const lastSyncedAt = Math.max(row?.checkedAt.getTime() ?? 0, lastAttemptAt.get(attemptKey) ?? 0);
    const isStale = Date.now() - lastSyncedAt > AUTO_SYNC_STALE_MS;
    if (isStale) {
      lastAttemptAt.set(attemptKey, Date.now());
      await syncArrLibrary(userId, kind).catch((err) => {
        console.error(`[arr-sync] ${kind} failed for user ${userId}:`, err);
      });
    }
  }
}

export async function syncAllConnectedArrUsers(): Promise<void> {
  for (const kind of ["sonarr", "radarr"] as const) {
    for (const userId of await ownersWithLibraryServers(kind)) {
      await syncArrLibrary(userId, kind).catch((err) => {
        console.error(`[arr-sync] ${kind} failed for user ${userId}:`, err);
      });
    }
  }
}

function syncKey(userId: string, kind: ArrProvider) {
  return `arr-sync:${kind}:${userId}`;
}

/** One sync per user and kind at a time — see syncPlexLibrary. */
export function syncArrLibrary(userId: string, kind: ArrProvider) {
  return singleFlight(syncKey(userId, kind), () => runSyncArrLibrary(userId, kind));
}

/** A fresh sync after the servers changed: waits out a run already going
 * (which read the old set of servers) rather than joining it. */
export function resyncArrLibrary(userId: string, kind: ArrProvider) {
  return runExclusive(syncKey(userId, kind), () => runSyncArrLibrary(userId, kind));
}

/** Resolves once no sync of this kind for this user is running. */
export function waitForArrSync(userId: string, kind: ArrProvider) {
  return whenIdle(syncKey(userId, kind));
}
