"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { arrStatusCache, plexLibraryItems, jellyfinLibraryItems, tmdbIdOverrides, users } from "@/lib/db/schema";
import type { MediaType } from "@/lib/db/schema";
import { getArrCredential, isArrFullyConfigured } from "@/lib/integrations/credentials";
import { getOrFetchTitle } from "@/lib/tmdb/cache";
import { findByImdbId } from "@/lib/tmdb/client";
import { resolveTmdbIdFromTvdbId } from "@/lib/tmdb/cross-reference";
import * as sonarr from "@/lib/sonarr/client";
import * as radarr from "@/lib/radarr/client";
import { SONARR_UNRESOLVED_ERROR } from "@/lib/requests/errors";
import { requireAdmin } from "@/lib/auth/require-admin";

export type AddToLibraryState = { error?: string; success?: boolean };

/** Defense in depth: only an admin's Sonarr/Radarr credential should ever be
 * used to add a title, whether via a direct add or an approved request —
 * both addMovieToRadarrForUser/addSeriesToSonarrForUser accept a raw userId
 * and are exported from a "use server" file, so this guard doesn't rely on
 * the caller (or the UI) being the only path that can reach them. */
async function isAdminUser(userId: string): Promise<boolean> {
  const [row] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  return row?.role === "admin";
}

/** Core "add this movie to Radarr" logic, usable for the acting user's own
 * add-to-library click or (with a different userId) an admin approving
 * someone else's request — the add always executes using whichever
 * userId's Radarr credential is passed in. */
export async function addMovieToRadarrForUser(
  userId: string,
  tmdbId: number,
): Promise<AddToLibraryState> {
  if (!(await isAdminUser(userId))) return { error: "Only the admin can add titles." };

  const credential = await getArrCredential(userId, "radarr");
  if (!isArrFullyConfigured(credential)) {
    return { error: "Connect Radarr in Settings first." };
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
    return { error: "Couldn't add this movie to Radarr." };
  }

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

  return { success: true };
}

/** Core "add this series to Sonarr" logic — see addMovieToRadarrForUser. */
export async function addSeriesToSonarrForUser(
  userId: string,
  tmdbId: number,
): Promise<AddToLibraryState> {
  if (!(await isAdminUser(userId))) return { error: "Only the admin can add titles." };

  const credential = await getArrCredential(userId, "sonarr");
  if (!isArrFullyConfigured(credential)) {
    return { error: "Connect Sonarr in Settings first." };
  }

  const title = await getOrFetchTitle("tv", tmdbId).catch(() => undefined);
  if (!title?.tvdbId) {
    return { error: SONARR_UNRESOLVED_ERROR };
  }

  let added: { id: number };
  try {
    const config = { baseUrl: credential.baseUrl, apiKey: credential.apiKey };

    // A series can already exist in Sonarr but unmonitored — e.g. it was
    // added before, then "Stop monitoring" was used. Sonarr's add endpoint
    // rejects a duplicate add in that case, so re-enable monitoring on the
    // existing entry instead of trying to add it again from scratch.
    const existing = await sonarr.getSeriesByTvdbId(config, title.tvdbId).catch(() => null);
    if (existing) {
      await sonarr.setSeriesMonitored(config, existing.id, true);
      added = existing;
    } else {
      const [lookupResult] = await sonarr.lookupByTvdbId(config, title.tvdbId);
      if (!lookupResult) throw new Error("No lookup result");
      added = await sonarr.addSeries(config, {
        lookupResult,
        qualityProfileId: credential.qualityProfileId,
        rootFolderPath: credential.rootFolderPath,
      });
    }
  } catch {
    return { error: "Couldn't add this series to Sonarr." };
  }

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

  return { success: true };
}

export async function addMovieToRadarr(
  tmdbId: number,
  _prevState: AddToLibraryState | undefined,
  _formData: FormData,
): Promise<AddToLibraryState> {
  const session = await auth();
  if (!session?.user) return { error: "Sign in to add titles." };

  const result = await addMovieToRadarrForUser(session.user.id, tmdbId);
  if (result.success) {
    revalidatePath(`/title/movie/${tmdbId}`);
    revalidatePath("/discover");
    revalidatePath("/library");
  }
  return result;
}

export async function addSeriesToSonarr(
  tmdbId: number,
  _prevState: AddToLibraryState | undefined,
  _formData: FormData,
): Promise<AddToLibraryState> {
  const session = await auth();
  if (!session?.user) return { error: "Sign in to add titles." };

  const result = await addSeriesToSonarrForUser(session.user.id, tmdbId);
  if (result.success) {
    revalidatePath(`/title/tv/${tmdbId}`);
    revalidatePath("/discover");
    revalidatePath("/library");
  }
  return result;
}

export type RelinkState = { error?: string; success?: boolean; newTmdbId?: number };

/** Corrects a title that's owned via the wrong TMDb match — e.g. Plex's own
 * agent matched a show to the wrong TMDb/TVDB record (a mislabeled library
 * folder is a common cause), and re-matching in Plex alone doesn't help if
 * the wrong id already got synced into Marquee's own tables. Repoints every
 * synced row currently linked to the wrong tmdbId over to the corrected one,
 * rather than trying to edit the (correct, immutable) TMDb record itself. */
export async function relinkTitleAction(
  mediaType: MediaType,
  currentTmdbId: number,
  _prevState: RelinkState | undefined,
  formData: FormData,
): Promise<RelinkState> {
  const admin = await requireAdmin("Only the admin can correct a title's match.");
  if (!admin.ok) return { error: admin.error };

  const tmdbIdInput = String(formData.get("tmdbId") || "").trim();
  const imdbIdInput = String(formData.get("imdbId") || "").trim();
  const tvdbIdInput = String(formData.get("tvdbId") || "").trim();

  let newTmdbId: number | null = null;

  if (tmdbIdInput) {
    const parsed = Number(tmdbIdInput);
    if (!Number.isInteger(parsed) || parsed <= 0) return { error: "TMDb ID must be a positive number." };
    newTmdbId = parsed;
  } else if (imdbIdInput) {
    const normalized = imdbIdInput.startsWith("tt") ? imdbIdInput : `tt${imdbIdInput}`;
    const result = await findByImdbId(normalized).catch(() => null);
    newTmdbId =
      (mediaType === "movie" ? result?.movie_results?.[0]?.id : result?.tv_results?.[0]?.id) ?? null;
    if (!newTmdbId) return { error: "Couldn't find that IMDb ID on TMDb." };
  } else if (tvdbIdInput) {
    if (mediaType !== "tv") return { error: "A TVDB ID only applies to TV shows." };
    const parsed = Number(tvdbIdInput);
    if (!Number.isInteger(parsed) || parsed <= 0) return { error: "TVDB ID must be a positive number." };
    newTmdbId = await resolveTmdbIdFromTvdbId(parsed).catch(() => null);
    if (!newTmdbId) return { error: "Couldn't find that TVDB ID on TMDb." };
  } else {
    return { error: "Enter a TMDb ID, IMDb ID, or TVDB ID." };
  }

  if (newTmdbId === currentTmdbId) {
    return { error: "That's already the current match." };
  }

  const newTitle = await getOrFetchTitle(mediaType, newTmdbId).catch(() => null);
  if (!newTitle) return { error: "Couldn't find that title on TMDb. Check the ID and try again." };

  try {
    await db.transaction(async (tx) => {
      // Persisted first: every Plex/Jellyfin/Sonarr/Radarr sync re-derives
      // this title's tmdbId fresh from that source's own (still-wrong) data
      // on every run, so without this override the very next sync would
      // silently revert the table updates below within minutes.
      await tx
        .insert(tmdbIdOverrides)
        .values({ userId: admin.userId, mediaType, wrongTmdbId: currentTmdbId, correctTmdbId: newTmdbId })
        .onConflictDoUpdate({
          target: [tmdbIdOverrides.userId, tmdbIdOverrides.mediaType, tmdbIdOverrides.wrongTmdbId],
          set: { correctTmdbId: newTmdbId },
        });

      await tx
        .update(plexLibraryItems)
        .set({ tmdbId: newTmdbId, tvdbId: newTitle.tvdbId ?? undefined })
        .where(and(eq(plexLibraryItems.mediaType, mediaType), eq(plexLibraryItems.tmdbId, currentTmdbId)));

      await tx
        .update(jellyfinLibraryItems)
        .set({ tmdbId: newTmdbId, tvdbId: newTitle.tvdbId ?? undefined })
        .where(
          and(eq(jellyfinLibraryItems.mediaType, mediaType), eq(jellyfinLibraryItems.tmdbId, currentTmdbId)),
        );

      await tx
        .update(arrStatusCache)
        .set({ externalId: newTmdbId })
        .where(
          and(
            eq(arrStatusCache.userId, admin.userId),
            eq(arrStatusCache.provider, mediaType === "movie" ? "radarr" : "sonarr"),
            eq(arrStatusCache.externalId, currentTmdbId),
          ),
        );
    });
  } catch (err) {
    console.error("[relink-title] update failed:", err);
    return {
      error: "Couldn't update — the corrected title may already be linked to something else in your library.",
    };
  }

  revalidatePath(`/title/${mediaType}/${currentTmdbId}`);
  revalidatePath(`/title/${mediaType}/${newTmdbId}`);
  revalidatePath("/library");
  revalidatePath("/discover");
  return { success: true, newTmdbId };
}
