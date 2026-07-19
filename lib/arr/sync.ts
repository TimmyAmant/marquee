import { and, eq, notInArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { arrStatusCache, integrationCredentials } from "@/lib/db/schema";
import type { ArrProvider } from "@/lib/db/schema";
import { getArrCredential } from "@/lib/integrations/credentials";
import { deriveRadarrStatus, deriveSonarrStatus } from "@/lib/integrations/arr-status-logic";
import * as sonarr from "@/lib/sonarr/client";
import * as radarr from "@/lib/radarr/client";
import { getOrFetchTitle } from "@/lib/tmdb/cache";
import { resolveTmdbIdFromTvdbId } from "@/lib/tmdb/cross-reference";
import { applyTmdbIdOverride } from "@/lib/library/title-overrides";

export async function syncArrLibrary(
  userId: string,
  provider: ArrProvider,
): Promise<{ count: number }> {
  const credential = await getArrCredential(userId, provider);
  if (!credential) throw new Error(`${provider} is not connected for this user`);
  const config = { baseUrl: credential.baseUrl, apiKey: credential.apiKey };

  let count = 0;
  const seenTmdbIds: number[] = [];
  let unresolvedCount = 0;

  if (provider === "radarr") {
    const [movies, queuedIds] = await Promise.all([
      radarr.getAllMovies(config),
      radarr.getQueuedMovieIds(config).catch(() => new Set<number>()),
    ]);
    for (const movie of movies) {
      const tmdbId = await applyTmdbIdOverride(userId, "movie", movie.tmdbId).catch(
        () => movie.tmdbId,
      );
      await getOrFetchTitle("movie", tmdbId).catch(() => null);
      // The queue is real-time; file count/monitored flags only reflect the
      // last sync, so a movie mid-download (no file yet) would otherwise
      // show as merely "monitored" until the download completes.
      const status = queuedIds.has(movie.id) ? "tracked_downloading" : deriveRadarrStatus(movie);
      const sizeBytes = movie.movieFile?.size ?? null;
      const filePath = movie.movieFile?.path ?? movie.path ?? null;
      const qualityCutoffNotMet = movie.movieFile?.qualityCutoffNotMet ?? null;
      const qualityName = movie.movieFile?.quality?.quality?.name ?? null;
      const dynamicRange = movie.movieFile?.mediaInfo?.videoDynamicRangeType || null;
      const audioCodec = movie.movieFile?.mediaInfo?.audioCodec || null;
      seenTmdbIds.push(tmdbId);

      await db
        .insert(arrStatusCache)
        .values({
          userId,
          provider: "radarr",
          externalId: tmdbId,
          arrId: movie.id,
          status,
          monitored: movie.monitored,
          sizeBytes,
          filePath,
          qualityCutoffNotMet,
          qualityName,
          dynamicRange,
          audioCodec,
          checkedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [arrStatusCache.userId, arrStatusCache.provider, arrStatusCache.externalId],
          set: {
            arrId: movie.id,
            status,
            monitored: movie.monitored,
            sizeBytes,
            filePath,
            qualityCutoffNotMet,
            qualityName,
            dynamicRange,
            audioCodec,
            checkedAt: new Date(),
          },
        });
      count++;
    }
  } else {
    const [allSeries, queuedIds] = await Promise.all([
      sonarr.getAllSeries(config),
      sonarr.getQueuedSeriesIds(config).catch(() => new Set<number>()),
    ]);
    for (const series of allSeries) {
      const resolvedTmdbId = await resolveTmdbIdFromTvdbId(series.tvdbId);
      if (!resolvedTmdbId) {
        // Couldn't resolve this run (e.g. transient TMDb lookup failure) — the
        // series may still genuinely exist in Sonarr, so don't let it fall out
        // of `seenTmdbIds` and get treated as deleted below.
        unresolvedCount++;
        continue;
      }
      const tmdbId = await applyTmdbIdOverride(userId, "tv", resolvedTmdbId).catch(() => resolvedTmdbId);
      seenTmdbIds.push(tmdbId);

      await getOrFetchTitle("tv", tmdbId).catch(() => null);
      // The queue is real-time; episode-file-count statistics only reflect
      // the last sync and don't move until an episode finishes importing,
      // so an in-progress download could otherwise show as merely
      // "monitored" for the entire 15-minute window between syncs.
      const status = queuedIds.has(series.id) ? "tracked_downloading" : deriveSonarrStatus(series);
      const sizeBytes = series.statistics?.sizeOnDisk ?? null;
      const filePath = series.path ?? null;

      await db
        .insert(arrStatusCache)
        .values({
          userId,
          provider: "sonarr",
          externalId: tmdbId,
          arrId: series.id,
          status,
          monitored: series.monitored,
          sizeBytes,
          filePath,
          checkedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [arrStatusCache.userId, arrStatusCache.provider, arrStatusCache.externalId],
          set: {
            arrId: series.id,
            status,
            monitored: series.monitored,
            sizeBytes,
            filePath,
            checkedAt: new Date(),
          },
        });
      count++;
    }
  }

  // Titles removed from Radarr/Sonarr directly (outside Marquee) won't appear
  // in the list above — drop their cached rows so they don't linger forever
  // as "still tracked" with a dead arrId. Skip this when some sonarr series
  // failed to resolve to a tmdbId this run — `seenTmdbIds` would be an
  // incomplete picture of what's actually still in Sonarr, and we'd wrongly
  // delete rows for series that are still there.
  if (unresolvedCount === 0) {
    if (seenTmdbIds.length > 0) {
      await db
        .delete(arrStatusCache)
        .where(
          and(
            eq(arrStatusCache.userId, userId),
            eq(arrStatusCache.provider, provider),
            notInArray(arrStatusCache.externalId, seenTmdbIds),
          ),
        );
    } else {
      // Nothing came back at all (e.g. an empty library) — clear everything
      // previously cached for this provider rather than leaving stale rows.
      await db
        .delete(arrStatusCache)
        .where(and(eq(arrStatusCache.userId, userId), eq(arrStatusCache.provider, provider)));
    }
  }

  return { count };
}

const AUTO_SYNC_STALE_MS = 15 * 60 * 1000;

export async function syncArrLibraryIfStale(userId: string): Promise<void> {
  for (const provider of ["sonarr", "radarr"] as const) {
    const credential = await getArrCredential(userId, provider);
    if (!credential) continue;

    const [row] = await db
      .select({ checkedAt: arrStatusCache.checkedAt })
      .from(arrStatusCache)
      .where(and(eq(arrStatusCache.userId, userId), eq(arrStatusCache.provider, provider)))
      .limit(1);

    const isStale = !row || Date.now() - row.checkedAt.getTime() > AUTO_SYNC_STALE_MS;
    if (isStale) {
      await syncArrLibrary(userId, provider).catch((err) => {
        console.error(`[arr-sync] ${provider} failed for user ${userId}:`, err);
      });
    }
  }
}

export async function syncAllConnectedArrUsers(): Promise<void> {
  for (const provider of ["sonarr", "radarr"] as const) {
    const rows = await db
      .selectDistinct({ userId: integrationCredentials.userId })
      .from(integrationCredentials)
      .where(eq(integrationCredentials.provider, provider));

    for (const row of rows) {
      await syncArrLibrary(row.userId, provider).catch((err) => {
        console.error(`[arr-sync] ${provider} failed for user ${row.userId}:`, err);
      });
    }
  }
}
