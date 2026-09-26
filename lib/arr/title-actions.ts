import { revalidatePathSafely as revalidatePath } from "@/lib/cache/revalidate";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { arrStatusCache, plexLibraryItems, jellyfinLibraryItems, tmdbIdOverrides, users } from "@/lib/db/schema";
import type { MediaType } from "@/lib/db/schema";
import { getArrCredential, isArrFullyConfigured } from "@/lib/integrations/credentials";
import { getArrTrackingInfo } from "@/lib/integrations/status";
import { getOrFetchTitle } from "@/lib/tmdb/cache";
import { findByImdbId } from "@/lib/tmdb/client";
import { resolveTmdbIdFromTvdbId } from "@/lib/tmdb/cross-reference";
import * as sonarr from "@/lib/sonarr/client";
import * as radarr from "@/lib/radarr/client";
import { seasonsSonarrKnows } from "@/lib/sonarr/season-monitoring";
import { SONARR_UNRESOLVED_ERROR } from "@/lib/requests/errors";

/** TMDb listed the requested seasons (createRequest checked), but Sonarr's
 * TVDB-based season list has none of them, so there's nothing to monitor. */
const SONARR_UNKNOWN_SEASONS_ERROR = "Sonarr doesn't list the requested seasons for this show.";
import { fail, type CoreResult } from "@/lib/core-result";

// Title-page Sonarr/Radarr operations shared by the title page's server
// actions (app/title/[type]/[id]/actions.ts), request approval
// (lib/requests/mutate.ts) and /api/v1/titles/*. Callers resolve the acting
// user; each function re-checks what it needs itself.

/** Defense in depth: only an admin's Sonarr/Radarr credential should ever be
 * used to add a title, whether via a direct add or an approved request —
 * addMovieToRadarrForUser/addSeriesToSonarrForUser accept a raw userId, so
 * this guard doesn't rely on the caller being the only path that reaches them. */
async function isAdminUser(userId: string): Promise<boolean> {
  const [row] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  return row?.role === "admin";
}

/** Core "add this movie to Radarr" logic, usable for the acting user's own
 * add-to-library click or (with a different userId) an admin approving
 * someone else's request — the add always executes using whichever
 * userId's Radarr credential is passed in. */
export async function addMovieToRadarrForUser(userId: string, tmdbId: number, fourK = false): Promise<CoreResult> {
  if (!(await isAdminUser(userId))) return fail("forbidden", "Only the admin can add titles.");

  const credential = await getArrCredential(userId, fourK ? "radarr4k" : "radarr");
  if (!isArrFullyConfigured(credential)) {
    return fail("conflict", `Connect ${fourK ? "the 4K Radarr" : "Radarr"} in Settings first.`);
  }

  let added: { id: number };
  try {
    const config = { baseUrl: credential.baseUrl, apiKey: credential.apiKey };

    // A movie can already exist in Radarr but unmonitored — e.g. it was
    // added before, then "Stop monitoring" was used. Radarr's add endpoint
    // rejects a duplicate add in that case, so re-enable monitoring on the
    // existing entry instead of trying to add it again from scratch.
    const existing = await radarr.getMovieByTmdbId(config, tmdbId).catch(() => null);
    if (existing) {
      await radarr.setMovieMonitored(config, existing.id, true);
      added = existing;
    } else {
      const lookupResult = await radarr.lookupByTmdbId(config, tmdbId);
      added = await radarr.addMovie(config, {
        lookupResult,
        qualityProfileId: credential.qualityProfileId,
        rootFolderPath: credential.rootFolderPath,
      });
    }
  } catch {
    return fail("upstream", `Couldn't add this movie to ${fourK ? "the 4K Radarr" : "Radarr"}.`);
  }

  // The 4K instance isn't part of the library cache (lib/arr/fourk.ts reads
  // it live), so there's nothing more to record.
  if (fourK) return { ok: true };

  // Radarr already has it at this point — a failure below is just our local
  // cache being stale, not the add itself failing, so still report success
  // (the 15-minute scheduled sync will reconcile the cache either way).
  try {
    // Reflect the add in our local cache immediately — the scheduled sync
    // won't pick this up for up to 15 minutes otherwise, leaving the title
    // looking untracked everywhere in the meantime. Also make sure the
    // titles cache has this row, since the Library page joins against it.
    await getOrFetchTitle("movie", tmdbId).catch(() => undefined);
    await db
      .insert(arrStatusCache)
      .values({
        userId,
        provider: "radarr",
        externalId: tmdbId,
        arrId: added.id,
        status: "tracked_monitored",
        monitored: true,
        checkedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [arrStatusCache.userId, arrStatusCache.provider, arrStatusCache.externalId],
        set: { arrId: added.id, status: "tracked_monitored", monitored: true, checkedAt: new Date() },
      });
  } catch (err) {
    console.error("[add-to-library] radarr cache write failed after successful add:", err);
  }

  return { ok: true };
}

/** Core "add this series to Sonarr" logic — see addMovieToRadarrForUser.
 * `seasons` comes from an approved season request: only those seasons get
 * monitored and searched for (on top of anything already monitored). Null,
 * the default, is the whole series — the title page's Add button and every
 * whole-series request. */
export async function addSeriesToSonarrForUser(
  userId: string,
  tmdbId: number,
  seasons: readonly number[] | null = null,
  /** Approving a request (rather than the admin's own Add button): a
   * whole-series request then also turns on every season of a show Sonarr
   * already has only part of. */
  forRequest = false,
  /** Into the 4K Sonarr instead of the main one. */
  fourK = false,
): Promise<CoreResult> {
  if (!(await isAdminUser(userId))) return fail("forbidden", "Only the admin can add titles.");

  const credential = await getArrCredential(userId, fourK ? "sonarr4k" : "sonarr");
  if (!isArrFullyConfigured(credential)) {
    return fail("conflict", `Connect ${fourK ? "the 4K Sonarr" : "Sonarr"} in Settings first.`);
  }

  const title = await getOrFetchTitle("tv", tmdbId).catch(() => undefined);
  if (!title?.tvdbId) {
    return fail("conflict", SONARR_UNRESOLVED_ERROR);
  }

  let added: { id: number };
  try {
    const config = { baseUrl: credential.baseUrl, apiKey: credential.apiKey };

    // A series can already exist in Sonarr but unmonitored — e.g. it was
    // added before, then "Stop monitoring" was used. Sonarr's add endpoint
    // rejects a duplicate add in that case, so re-enable monitoring on the
    // existing entry instead of trying to add it again from scratch.
    const existing = await sonarr.getSeriesByTvdbId(config, title.tvdbId).catch(() => null);
    if (existing && seasons) {
      const known = seasonsSonarrKnows(existing.seasons ?? [], seasons);
      if (known.length === 0) return fail("conflict", SONARR_UNKNOWN_SEASONS_ERROR);
      await sonarr.monitorSeriesSeasons(config, existing.id, known);
      // Monitoring alone only catches episodes as they're released; these
      // seasons have usually aired already, so ask Sonarr to go find them.
      for (const seasonNumber of known) {
        await sonarr.searchSeason(config, existing.id, seasonNumber);
      }
      added = existing;
    } else if (existing && forRequest) {
      // Approving a whole-series request. The show may be in Sonarr with only
      // some seasons on, because a season request added it: turn every season
      // on and look for them.
      await sonarr.monitorWholeSeries(config, existing.id);
      await sonarr.searchSeries(config, existing.id);
      added = existing;
    } else if (existing) {
      // The admin's Add on a show Sonarr already has (the status cache was
      // behind): just turn the series back on, as before — the admin chose
      // its seasons in Sonarr.
      await sonarr.setSeriesMonitored(config, existing.id, true);
      added = existing;
    } else {
      const [lookupResult] = await sonarr.lookupByTvdbId(config, title.tvdbId);
      if (!lookupResult) throw new Error("No lookup result");
      if (seasons && seasonsSonarrKnows(lookupResult.seasons ?? [], seasons).length === 0) {
        return fail("conflict", SONARR_UNKNOWN_SEASONS_ERROR);
      }
      added = await sonarr.addSeries(config, {
        lookupResult,
        qualityProfileId: credential.qualityProfileId,
        rootFolderPath: credential.rootFolderPath,
        seasons,
      });
    }
  } catch {
    return fail("upstream", "Couldn't add this series to Sonarr.");
  }

  if (fourK) return { ok: true };

  // Sonarr already has it at this point — a failure below is just our local
  // cache being stale, not the add itself failing, so still report success
  // (the 15-minute scheduled sync will reconcile the cache either way).
  try {
    await db
      .insert(arrStatusCache)
      .values({
        userId,
        provider: "sonarr",
        externalId: tmdbId,
        arrId: added.id,
        status: "tracked_monitored",
        monitored: true,
        checkedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [arrStatusCache.userId, arrStatusCache.provider, arrStatusCache.externalId],
        set: { arrId: added.id, status: "tracked_monitored", monitored: true, checkedAt: new Date() },
      });
  } catch (err) {
    console.error("[add-to-library] sonarr cache write failed after successful add:", err);
  }

  return { ok: true };
}

/** Adds a title with the acting user's own Sonarr/Radarr credential and
 * revalidates the pages showing it — the title page's Add button and the
 * poster cards' quick-add. */
export async function addTitleToLibrary(
  userId: string,
  mediaType: MediaType,
  tmdbId: number,
  /** Into the 4K Sonarr/Radarr (lib/arr/fourk.ts) instead. */
  fourK = false,
): Promise<CoreResult> {
  const result =
    mediaType === "movie"
      ? await addMovieToRadarrForUser(userId, tmdbId, fourK)
      : await addSeriesToSonarrForUser(userId, tmdbId, null, false, fourK);
  if (result.ok) {
    revalidatePath(`/title/${mediaType}/${tmdbId}`);
    revalidatePath("/discover");
  }
  return result;
}

export type RelinkInput = { tmdbId?: string; imdbId?: string; tvdbId?: string };

/** Corrects a title that's owned via the wrong TMDb match — e.g. Plex's own
 * agent matched a show to the wrong TMDb/TVDB record (a mislabeled library
 * folder is a common cause), and re-matching in Plex alone doesn't help if
 * the wrong id already got synced into Marquee's own tables. Repoints every
 * synced row currently linked to the wrong tmdbId over to the corrected one,
 * rather than trying to edit the (correct, immutable) TMDb record itself.
 * Caller must have verified the actor is the admin. */
export async function relinkTitle(
  adminUserId: string,
  mediaType: MediaType,
  currentTmdbId: number,
  input: RelinkInput,
): Promise<CoreResult<{ newTmdbId: number }>> {
  const tmdbIdInput = (input.tmdbId ?? "").trim();
  const imdbIdInput = (input.imdbId ?? "").trim();
  const tvdbIdInput = (input.tvdbId ?? "").trim();

  let newTmdbId: number | null = null;

  if (tmdbIdInput) {
    const parsed = Number(tmdbIdInput);
    if (!Number.isInteger(parsed) || parsed <= 0) return fail("invalid", "TMDb ID must be a positive number.");
    newTmdbId = parsed;
  } else if (imdbIdInput) {
    const normalized = imdbIdInput.startsWith("tt") ? imdbIdInput : `tt${imdbIdInput}`;
    const result = await findByImdbId(normalized).catch(() => null);
    newTmdbId =
      (mediaType === "movie" ? result?.movie_results?.[0]?.id : result?.tv_results?.[0]?.id) ?? null;
    if (!newTmdbId) return fail("not_found", "Couldn't find that IMDb ID on TMDb.");
  } else if (tvdbIdInput) {
    if (mediaType !== "tv") return fail("invalid", "A TVDB ID only applies to TV shows.");
    const parsed = Number(tvdbIdInput);
    if (!Number.isInteger(parsed) || parsed <= 0) return fail("invalid", "TVDB ID must be a positive number.");
    newTmdbId = await resolveTmdbIdFromTvdbId(parsed).catch(() => null);
    if (!newTmdbId) return fail("not_found", "Couldn't find that TVDB ID on TMDb.");
  } else {
    return fail("invalid", "Enter a TMDb ID, IMDb ID, or TVDB ID.");
  }

  if (newTmdbId === currentTmdbId) {
    return fail("invalid", "That's already the current match.");
  }

  const newTitle = await getOrFetchTitle(mediaType, newTmdbId).catch(() => null);
  if (!newTitle) return fail("not_found", "Couldn't find that title on TMDb. Check the ID and try again.");

  const resolvedTmdbId = newTmdbId;
  try {
    await db.transaction(async (tx) => {
      // Persisted first: every Plex/Jellyfin/Sonarr/Radarr sync re-derives
      // this title's tmdbId fresh from that source's own (still-wrong) data
      // on every run, so without this override the very next sync would
      // silently revert the table updates below within minutes.
      await tx
        .insert(tmdbIdOverrides)
        .values({ userId: adminUserId, mediaType, wrongTmdbId: currentTmdbId, correctTmdbId: resolvedTmdbId })
        .onConflictDoUpdate({
          target: [tmdbIdOverrides.userId, tmdbIdOverrides.mediaType, tmdbIdOverrides.wrongTmdbId],
          set: { correctTmdbId: resolvedTmdbId },
        });

      await tx
        .update(plexLibraryItems)
        .set({ tmdbId: resolvedTmdbId, tvdbId: newTitle.tvdbId ?? undefined })
        .where(and(eq(plexLibraryItems.mediaType, mediaType), eq(plexLibraryItems.tmdbId, currentTmdbId)));

      await tx
        .update(jellyfinLibraryItems)
        .set({ tmdbId: resolvedTmdbId, tvdbId: newTitle.tvdbId ?? undefined })
        .where(
          and(eq(jellyfinLibraryItems.mediaType, mediaType), eq(jellyfinLibraryItems.tmdbId, currentTmdbId)),
        );

      await tx
        .update(arrStatusCache)
        .set({ externalId: resolvedTmdbId })
        .where(
          and(
            eq(arrStatusCache.userId, adminUserId),
            eq(arrStatusCache.provider, mediaType === "movie" ? "radarr" : "sonarr"),
            eq(arrStatusCache.externalId, currentTmdbId),
          ),
        );
    });
  } catch (err) {
    console.error("[relink-title] update failed:", err);
    return fail(
      "conflict",
      "Couldn't update — the corrected title may already be linked to something else in your library.",
    );
  }

  revalidatePath(`/title/${mediaType}/${currentTmdbId}`);
  revalidatePath(`/title/${mediaType}/${resolvedTmdbId}`);
  revalidatePath("/discover");
  return { ok: true, newTmdbId: resolvedTmdbId };
}

/** Queues an immediate Radarr/Sonarr search, mirroring the *arr apps' own
 * "Search Monitored" button — a one-off nudge for a title that's stuck, not
 * a substitute for the regular search/indexer schedule those apps already
 * run on their own. Caller must have verified the actor is the admin. */
export async function searchTitle(
  adminUserId: string,
  mediaType: MediaType,
  tmdbId: number,
  tvdbId: number | null,
): Promise<CoreResult> {
  const tracking = await getArrTrackingInfo(adminUserId, mediaType, tmdbId, tvdbId).catch(() => null);
  if (!tracking) return fail("conflict", "Not tracked in Radarr/Sonarr.");

  try {
    if (mediaType === "movie") {
      const credential = await getArrCredential(adminUserId, "radarr");
      if (!credential) return fail("conflict", "Connect Radarr in Settings first.");
      await radarr.searchMovie({ baseUrl: credential.baseUrl, apiKey: credential.apiKey }, tracking.arrId);
    } else {
      const credential = await getArrCredential(adminUserId, "sonarr");
      if (!credential) return fail("conflict", "Connect Sonarr in Settings first.");
      await sonarr.searchSeries({ baseUrl: credential.baseUrl, apiKey: credential.apiKey }, tracking.arrId);
    }
  } catch {
    return fail("upstream", "Couldn't queue a search — the *arr app didn't accept the request.");
  }

  return { ok: true };
}

/** Toggles monitored on/off directly from the title page, same effect as
 * the equivalent toggle inside Radarr/Sonarr itself. Caller must have
 * verified the actor is the admin. */
export async function setTitleMonitored(
  adminUserId: string,
  mediaType: MediaType,
  tmdbId: number,
  tvdbId: number | null,
  monitored: boolean,
): Promise<CoreResult> {
  const tracking = await getArrTrackingInfo(adminUserId, mediaType, tmdbId, tvdbId).catch(() => null);
  if (!tracking) return fail("conflict", "Not tracked in Radarr/Sonarr.");

  try {
    if (mediaType === "movie") {
      const credential = await getArrCredential(adminUserId, "radarr");
      if (!credential) return fail("conflict", "Connect Radarr in Settings first.");
      await radarr.setMovieMonitored(
        { baseUrl: credential.baseUrl, apiKey: credential.apiKey },
        tracking.arrId,
        monitored,
      );
    } else {
      const credential = await getArrCredential(adminUserId, "sonarr");
      if (!credential) return fail("conflict", "Connect Sonarr in Settings first.");
      await sonarr.setSeriesMonitored(
        { baseUrl: credential.baseUrl, apiKey: credential.apiKey },
        tracking.arrId,
        monitored,
      );
    }
  } catch {
    return fail("upstream", "Couldn't update monitoring — the *arr app didn't accept the request.");
  }

  await db
    .update(arrStatusCache)
    .set({ monitored })
    .where(
      and(
        eq(arrStatusCache.userId, adminUserId),
        eq(arrStatusCache.provider, mediaType === "movie" ? "radarr" : "sonarr"),
        eq(arrStatusCache.externalId, tmdbId),
      ),
    )
    .catch(() => undefined);

  revalidatePath(`/title/${mediaType}/${tmdbId}`);
  return { ok: true };
}
