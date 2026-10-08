import { and, eq, inArray, isNull, lt, notInArray, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { runExclusive, singleFlight, whenIdle } from "@/lib/async/single-flight";
import { arrStatusCache, titles } from "@/lib/db/schema";
import type { ArrProvider } from "@/lib/db/schema";
import { IntegrationDisconnectedError } from "@/lib/integrations/credentials";
import { deriveRadarrStatus, deriveSonarrStatus, statusWithQueue, type QueueSummary } from "@/lib/integrations/arr-status-logic";
import type { LibraryStatus } from "@/components/status-badge";
import * as sonarr from "@/lib/sonarr/client";
import * as radarr from "@/lib/radarr/client";
import { getOrFetchTitle, upsertTitleLight } from "@/lib/tmdb/cache";
import { lookupTmdbIdFromTvdbId } from "@/lib/tmdb/cross-reference";
import { loadTmdbIdOverrides } from "@/lib/library/title-overrides";
import { isCacheHit } from "@/lib/tmdb/cache-policy";
import { arrConfig, listLibraryServers, ownersWithLibraryServers, type ArrServer } from "@/lib/arr/servers";
import { mergeServerCopies, type ServerCopy } from "@/lib/arr/merge";
import { statusRank } from "@/lib/arr/fan-out";
import { sonarrEpisodeCounts } from "@/lib/library/episode-counts";

// The library cache (arr_status_cache) for Sonarr/Radarr: one row per title
// across every standard (non-4K) server of that kind. Each server is listed
// in parallel; a title more than one of them has gets the furthest-along
// copy (owned beats downloading beats wanted — lib/arr/merge.ts), the
// default server winning a tie. The 4K servers aren't part of the library
// (lib/arr/fourk.ts).

/** How many titles to write between checks that the servers are unchanged —
 * also how many go in each batched write. */
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
  /** Sonarr: episode files on disk. */
  episodeCount?: number | null;
  /** Sonarr: a series poster's have/aired, specials left out. */
  episodesHave?: number | null;
  episodesAired?: number | null;
  /** How far its download is, while it's downloading. */
  downloadProgress: number | null;
};

/** A Radarr movie's cache row. The queue is real-time; file count/monitored
 * flags only reflect Radarr's last look, so a movie mid-download (no file
 * yet) would otherwise show as merely "monitored" until it lands. Also used
 * by the minute-by-minute download watch (lib/arr/download-watch.ts). */
export function radarrRowFields(movie: radarr.RadarrMovie, queue: QueueSummary | undefined): RowFields {
  const { status, progress } = statusWithQueue(deriveRadarrStatus(movie), queue);
  return {
    arrId: movie.id,
    status,
    monitored: movie.monitored,
    sizeBytes: movie.movieFile?.size ?? null,
    filePath: movie.movieFile?.path ?? movie.path ?? null,
    qualityCutoffNotMet: movie.movieFile?.qualityCutoffNotMet ?? null,
    qualityName: movie.movieFile?.quality?.quality?.name ?? null,
    dynamicRange: movie.movieFile?.mediaInfo?.videoDynamicRangeType || null,
    audioCodec: movie.movieFile?.mediaInfo?.audioCodec || null,
    downloadProgress: progress,
  };
}

/** A Sonarr series' cache row — see radarrRowFields. Episode-file counts
 * don't move until an episode is imported, so the queue says what's coming. */
export function sonarrRowFields(series: sonarr.SonarrSeries, queue: QueueSummary | undefined): RowFields {
  const { status, progress } = statusWithQueue(deriveSonarrStatus(series), queue);
  const counts = sonarrEpisodeCounts(series.seasons, series.monitored);
  return {
    arrId: series.id,
    status,
    monitored: series.monitored,
    sizeBytes: series.statistics?.sizeOnDisk ?? null,
    filePath: series.path ?? null,
    episodeCount: series.statistics?.episodeFileCount ?? null,
    episodesHave: counts?.have ?? null,
    episodesAired: counts?.total ?? null,
    downloadProgress: progress,
  };
}

/** One title's cache row, fresh from its server — the download watch's and
 * the media-server check's re-read of a single movie or series. */
export async function fetchArrRowFields(
  server: ArrServer,
  kind: ArrProvider,
  arrId: number,
  queue: QueueSummary | undefined,
): Promise<RowFields> {
  const config = arrConfig(server);
  return kind === "radarr"
    ? radarrRowFields(await radarr.getMovie(config, arrId), queue)
    : sonarrRowFields(await sonarr.getSeries(config, arrId), queue);
}

/** Throws when this kind's standard servers are no longer the ones this run
 * started with (one was removed, added or moved to 4K): a server removed
 * mid-run must not have its titles written back, and a later run — which
 * the change itself starts — reads the new set. */
async function assertSameServers(userId: string, kind: ArrProvider, ids: readonly string[]): Promise<void> {
  const now = await listLibraryServers(userId, kind);
  const same = now.length === ids.length && now.every((s) => ids.includes(s.id));
  if (!same) throw new IntegrationDisconnectedError(kind);
}

type Listing<T> =
  | { server: ArrServer; items: T[]; queue: Map<number, QueueSummary> }
  | { server: ArrServer; failed: unknown };

async function listEach<T>(
  servers: ArrServer[],
  list: (server: ArrServer) => Promise<T[]>,
  queue: (server: ArrServer) => Promise<Map<number, QueueSummary>>,
): Promise<Listing<T>[]> {
  return Promise.all(
    servers.map(async (server) => {
      try {
        const [items, queueSummaries] = await Promise.all([
          list(server),
          queue(server).catch(() => new Map<number, QueueSummary>()),
        ]);
        return { server, items, queue: queueSummaries };
      } catch (failed) {
        return { server, failed };
      }
    }),
  );
}

/** The batched upsert's update: each of these columns from the row that
 * collided — the same columns the row's insert has, so nothing it leaves out
 * (a Sonarr row has no quality) is touched. */
function upsertSet(keys: readonly (keyof RowFields | "serverId" | "checkedAt")[]) {
  return Object.fromEntries(keys.map((key) => [key, sql.raw(`excluded."${arrStatusCache[key].name}"`)]));
}

/** Makes sure the titles cache has each of these (the Library page joins
 * against it): one query for the batch, and TMDb asked only about the ones
 * getOrFetchTitle would have fetched anyway. */
async function cacheTitles(
  mediaType: "movie" | "tv",
  tmdbIds: number[],
  fallbackNames: Map<number, string>,
): Promise<void> {
  if (tmdbIds.length === 0) return;
  const cached = await db
    .select({
      tmdbId: titles.tmdbId,
      posterPath: titles.posterPath,
      backdropPath: titles.backdropPath,
      overview: titles.overview,
      refreshedAt: titles.refreshedAt,
      hasRawTmdb: sql<boolean>`${titles.rawTmdb} is not null`,
    })
    .from(titles)
    .where(and(eq(titles.mediaType, mediaType), inArray(titles.tmdbId, tmdbIds)))
    .catch(() => []);
  const hits = new Set(cached.filter((row) => isCacheHit(row, row.hasRawTmdb)).map((row) => row.tmdbId));
  for (const tmdbId of tmdbIds) {
    if (hits.has(tmdbId)) continue;
    const fetched = await getOrFetchTitle(mediaType, tmdbId).catch(() => null);
    // TMDb couldn't be reached (or no longer has the id): a row with
    // Radarr's or Sonarr's name, so the title still shows in the Library
    // rather than disappearing from it. Without TMDb details it's fetched
    // again on the next sync.
    const name = fallbackNames.get(tmdbId);
    if (!fetched && name) await upsertTitleLight({ mediaType, tmdbId, name }).catch(() => null);
  }
}

async function runSyncArrLibrary(userId: string, kind: ArrProvider): Promise<{ count: number }> {
  const servers = await listLibraryServers(userId, kind);
  if (servers.length === 0) throw new Error(`${kind} is not connected for this user`);
  const serverIds = servers.map((s) => s.id);
  // When the servers were read. Rows are written as of this moment, and only
  // over rows older than it: the download watch (lib/arr/download-watch.ts)
  // or an add (lib/arr/title-actions.ts) that lands while this run is still
  // going has fresher news than these listings, and keeps it.
  const snapshotAt = new Date();
  const mediaType = kind === "radarr" ? "movie" : "tv";
  // The user's tmdbId corrections, read once for the whole run.
  const overrides = await loadTmdbIdOverrides(userId, mediaType).catch(() => new Map<number, number>());
  const override = (tmdbId: number) => overrides.get(tmdbId) ?? tmdbId;

  const copies: ServerCopy<RowFields>[] = [];
  /** Each title's name in Radarr/Sonarr, for when TMDb can't supply it. */
  const fallbackNames = new Map<number, string>();
  let failedLookupCount = 0;
  let listings: Listing<unknown>[];

  if (kind === "radarr") {
    const movieListings = await listEach(
      servers,
      (s) => radarr.getAllMovies(arrConfig(s)),
      (s) => radarr.getQueueSummaries(arrConfig(s)),
    );
    listings = movieListings;
    for (const listing of movieListings) {
      if (!("items" in listing)) continue;
      for (const movie of listing.items) {
        copies.push({
          serverId: listing.server.id,
          tmdbId: override(movie.tmdbId),
          fields: radarrRowFields(movie, listing.queue.get(movie.id)),
        });
        if (movie.title) fallbackNames.set(override(movie.tmdbId), movie.title);
      }
    }
  } else {
    const seriesListings = await listEach(
      servers,
      (s) => sonarr.getAllSeries(arrConfig(s)),
      (s) => sonarr.getQueueSummaries(arrConfig(s)),
    );
    listings = seriesListings;
    const resolved = new Map<number, number | null>();
    for (const listing of seriesListings) {
      if (!("items" in listing)) continue;
      for (const series of listing.items) {
        let tmdbId = resolved.get(series.tvdbId);
        // Sonarr's own TMDb id first; the TVDB lookup only when it has none.
        if (tmdbId === undefined && series.tmdbId && series.tmdbId > 0) {
          tmdbId = override(series.tmdbId);
          resolved.set(series.tvdbId, tmdbId);
        }
        if (tmdbId === undefined) {
          const lookup = await lookupTmdbIdFromTvdbId(series.tvdbId);
          // A failed lookup (e.g. TMDb briefly unreachable) means this series
          // may well have a cached row from an earlier run, so the cleanup
          // below has to sit this one out. A series TMDb simply has no match
          // for never had a row to begin with, so it doesn't block cleanup —
          // otherwise one obscure show would switch cleanup off for good.
          if (!lookup.tmdbId && lookup.failed) failedLookupCount++;
          tmdbId = lookup.tmdbId ? override(lookup.tmdbId) : null;
          resolved.set(series.tvdbId, tmdbId);
        }
        if (!tmdbId) continue;
        copies.push({
          serverId: listing.server.id,
          tmdbId,
          fields: sonarrRowFields(series, listing.queue.get(series.id)),
        });
        if (series.title) fallbackNames.set(tmdbId, series.title);
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
  const toWrite = merged.filter(
    ({ tmdbId, fields }) => !(keep.has(tmdbId) && statusRank(keep.get(tmdbId)) > statusRank(fields.status)),
  );
  for (let start = 0; start < toWrite.length; start += CONNECTED_CHECK_EVERY) {
    if (start > 0) await assertSameServers(userId, kind, serverIds);
    const batch = toWrite.slice(start, start + CONNECTED_CHECK_EVERY);
    await cacheTitles(
      mediaType,
      batch.map((copy) => copy.tmdbId),
      fallbackNames,
    );
    await db
      .insert(arrStatusCache)
      .values(
        batch.map(({ tmdbId, serverId, fields }) => ({
          ...fields,
          userId,
          provider: kind,
          externalId: tmdbId,
          serverId,
          checkedAt: snapshotAt,
        })),
      )
      .onConflictDoUpdate({
        target: [arrStatusCache.userId, arrStatusCache.provider, arrStatusCache.externalId],
        // Every row of a kind has the same fields (radarrRowFields or
        // sonarrRowFields), so the first one's say what to update.
        set: upsertSet([...(Object.keys(batch[0].fields) as (keyof RowFields)[]), "serverId", "checkedAt"]),
        setWhere: lt(arrStatusCache.checkedAt, snapshotAt),
      });
    count += batch.length;
  }

  // Titles removed from every server (outside Marquee) weren't written
  // above — drop their cached rows so they don't linger as "still tracked".
  // Every row goes except one from a server that didn't answer this time:
  // rows from a server that answered, from one since removed (null), and
  // from one no longer in the library — moved to 4K, whose copies mustn't
  // count as the library. Anything written since the snapshot (by this run,
  // the download watch or an add) stays. A Sonarr series whose TMDb lookup
  // failed this run skips cleanup entirely, since this run's rows would then
  // be an incomplete picture.
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
          lt(arrStatusCache.checkedAt, snapshotAt),
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
