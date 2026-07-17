"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { arrStatusCache } from "@/lib/db/schema";
import { getArrCredential, isArrFullyConfigured } from "@/lib/integrations/credentials";
import { getOrFetchTitle } from "@/lib/tmdb/cache";
import * as sonarr from "@/lib/sonarr/client";
import * as radarr from "@/lib/radarr/client";

export type AddToLibraryState = { error?: string; success?: boolean };

/** Core "add this movie to Radarr" logic, usable for the acting user's own
 * add-to-library click or (with a different userId) an admin approving
 * someone else's request — the add always executes using whichever
 * userId's Radarr credential is passed in. */
export async function addMovieToRadarrForUser(
  userId: string,
  tmdbId: number,
): Promise<AddToLibraryState> {
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
  const credential = await getArrCredential(userId, "sonarr");
  if (!isArrFullyConfigured(credential)) {
    return { error: "Connect Sonarr in Settings first." };
  }

  const title = await getOrFetchTitle("tv", tmdbId).catch(() => undefined);
  if (!title?.tvdbId) {
    return { error: "Couldn't resolve this show for Sonarr." };
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
