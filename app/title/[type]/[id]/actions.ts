"use server";

import { auth } from "@/auth";
import type { MediaType } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/require-admin";
import { addTitleToLibrary, relinkTitle, searchTitle, setTitleMonitored } from "@/lib/arr/title-actions";
import { parseAddOverrides, parseAddOverridesForm } from "@/lib/arr/add-options";

// Thin form/session wrappers — the logic lives in lib/arr/title-actions.ts,
// shared with /api/v1/titles/*.

export type AddToLibraryState = { error?: string; success?: boolean };

export async function addMovieToRadarr(
  tmdbId: number,
  _prevState: AddToLibraryState | undefined,
  formData: FormData,
): Promise<AddToLibraryState> {
  const session = await auth();
  if (!session?.user) return { error: "Sign in to add titles." };

  // The "Advanced" picks, when opened (components/add-advanced-options.tsx).
  const parsed = parseAddOverridesForm(formData, "movie");
  if (!parsed.ok) return { error: parsed.error };
  const result = await addTitleToLibrary(session.user.id, "movie", tmdbId, false, parsed.overrides);
  return result.ok ? { success: true } : { error: result.error };
}

export async function addSeriesToSonarr(
  tmdbId: number,
  _prevState: AddToLibraryState | undefined,
  formData: FormData,
): Promise<AddToLibraryState> {
  const session = await auth();
  if (!session?.user) return { error: "Sign in to add titles." };

  const parsed = parseAddOverridesForm(formData, "tv");
  if (!parsed.ok) return { error: parsed.error };
  const result = await addTitleToLibrary(session.user.id, "tv", tmdbId, false, parsed.overrides);
  return result.ok ? { success: true } : { error: result.error };
}

/** "Add to 4K Radarr/Sonarr" (admin), with the Advanced picks if any —
 * whatever the browser sends, checked by the same parser as the API. */
export async function addToFourK(mediaType: MediaType, tmdbId: number, overrides?: unknown): Promise<AddToLibraryState> {
  const session = await auth();
  if (!session?.user) return { error: "Sign in to add titles." };
  if ((mediaType !== "movie" && mediaType !== "tv") || !Number.isSafeInteger(tmdbId) || tmdbId <= 0) {
    return { error: "That title couldn't be added." };
  }
  const parsed =
    overrides && typeof overrides === "object"
      ? parseAddOverrides(overrides as Record<string, unknown>, mediaType)
      : { ok: true as const, overrides: {} };
  if (!parsed.ok) return { error: parsed.error };
  const result = await addTitleToLibrary(session.user.id, mediaType, tmdbId, true, parsed.overrides);
  return result.ok ? { success: true } : { error: result.error };
}

export type RelinkState = { error?: string; success?: boolean; newTmdbId?: number };

/** Corrects a title that's owned via the wrong TMDb match — see relinkTitle. */
export async function relinkTitleAction(
  mediaType: MediaType,
  currentTmdbId: number,
  _prevState: RelinkState | undefined,
  formData: FormData,
): Promise<RelinkState> {
  const admin = await requireAdmin("Only the admin can correct a title's match.");
  if (!admin.ok) return { error: admin.error };

  const result = await relinkTitle(admin.userId, mediaType, currentTmdbId, {
    tmdbId: String(formData.get("tmdbId") || ""),
    imdbId: String(formData.get("imdbId") || ""),
    tvdbId: String(formData.get("tvdbId") || ""),
  });
  return result.ok ? { success: true, newTmdbId: result.newTmdbId } : { error: result.error };
}

export type ArrCommandState = { error?: string; success?: boolean };

/** Queues an immediate Radarr/Sonarr search — see searchTitle. */
export async function searchTitleAction(
  mediaType: MediaType,
  tmdbId: number,
  tvdbId: number | null,
  _prevState: ArrCommandState | undefined,
  _formData: FormData,
): Promise<ArrCommandState> {
  const admin = await requireAdmin("Only the admin can trigger a search.");
  if (!admin.ok) return { error: admin.error };

  const result = await searchTitle(admin.userId, mediaType, tmdbId, tvdbId);
  return result.ok ? { success: true } : { error: result.error };
}

/** Toggles monitored on/off directly from the title page — see setTitleMonitored. */
export async function setTitleMonitoredAction(
  mediaType: MediaType,
  tmdbId: number,
  tvdbId: number | null,
  monitored: boolean,
  _prevState: ArrCommandState | undefined,
  _formData: FormData,
): Promise<ArrCommandState> {
  const admin = await requireAdmin("Only the admin can change monitoring.");
  if (!admin.ok) return { error: admin.error };

  const result = await setTitleMonitored(admin.userId, mediaType, tmdbId, tvdbId, monitored);
  return result.ok ? { success: true } : { error: result.error };
}
