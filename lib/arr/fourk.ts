import type { ArrInstance, ArrProvider, MediaType } from "@/lib/db/schema";
import type { LibraryStatus } from "@/components/status-badge";
import { getArrCredential, isArrFullyConfigured } from "@/lib/integrations/credentials";
import { deriveRadarrStatus, deriveSonarrStatus } from "@/lib/integrations/arr-status-logic";
import * as radarr from "@/lib/radarr/client";
import * as sonarr from "@/lib/sonarr/client";

// The optional 4K Sonarr and Radarr: a second instance of each that keeps 4K
// copies apart from the main library, the way Seerr's 4K servers do. A
// title can be requested "in 4K"; approving that adds it here instead of to
// the main instance. Unlike the main instances, these aren't synced into
// the library cache — "owned" everywhere keeps meaning the main library —
// and a title page reads the 4K status live.

/** The kind of service an instance is (which API it speaks). */
export function arrKindOf(instance: ArrInstance): ArrProvider {
  return instance === "sonarr" || instance === "sonarr4k" ? "sonarr" : "radarr";
}

export function isFourK(instance: ArrInstance): boolean {
  return instance === "sonarr4k" || instance === "radarr4k";
}

/** The instance a title of this type goes to. */
export function arrInstanceFor(mediaType: MediaType, fourK: boolean): ArrInstance {
  if (mediaType === "movie") return fourK ? "radarr4k" : "radarr";
  return fourK ? "sonarr4k" : "sonarr";
}

/** "Sonarr", "4K Radarr". */
export function arrInstanceLabel(instance: ArrInstance): string {
  const name = arrKindOf(instance) === "sonarr" ? "Sonarr" : "Radarr";
  return isFourK(instance) ? `4K ${name}` : name;
}

/** Whether the 4K instance for this type is connected with a root folder
 * and quality profile — what a 4K request or add needs. */
export async function isFourKReady(adminUserId: string, mediaType: MediaType): Promise<boolean> {
  return isArrFullyConfigured(await getArrCredential(adminUserId, arrInstanceFor(mediaType, true)));
}

export type FourKStatus = {
  /** Set up with defaults, so 4K requests and adds can go there. */
  configured: boolean;
  /** How the 4K instance has the title; "untracked" when it doesn't. */
  status: LibraryStatus;
};

/**
 * The title as the 4K instance has it, asked live (it's one lookup, and only
 * a title page asks). Null when there's no 4K instance for this type at all.
 * A lookup that fails counts as "untracked" rather than failing the page.
 */
/** A title page waits at most this long for the 4K instance; a slow or
 * unreachable one then reads as "untracked" rather than holding the page. */
const FOURK_LOOKUP_BUDGET_MS = 2500;

function withinBudget<T>(promise: Promise<T>, fallback: T): Promise<T> {
  return Promise.race([
    promise.catch(() => fallback),
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), FOURK_LOOKUP_BUDGET_MS).unref?.()),
  ]);
}

/** Asks the 4K instance to search for the title again; null when it
 * doesn't have the title (or there's no 4K instance). */
export async function searchFourK(
  adminUserId: string,
  mediaType: MediaType,
  tmdbId: number,
  tvdbId: number | null,
): Promise<{ ok: true } | { ok: false; code: "upstream"; error: string } | null> {
  const credential = await getArrCredential(adminUserId, arrInstanceFor(mediaType, true));
  if (!credential) return null;
  const config = { baseUrl: credential.baseUrl, apiKey: credential.apiKey };
  try {
    if (mediaType === "movie") {
      const movie = await radarr.getMovieByTmdbId(config, tmdbId);
      if (!movie) return null;
      await radarr.searchMovie(config, movie.id);
    } else {
      if (!tvdbId) return null;
      const series = await sonarr.getSeriesByTvdbId(config, tvdbId);
      if (!series) return null;
      await sonarr.searchSeries(config, series.id);
    }
    return { ok: true };
  } catch {
    return { ok: false, code: "upstream", error: `Couldn't queue a search on the 4K ${mediaType === "movie" ? "Radarr" : "Sonarr"}.` };
  }
}

export async function getFourKStatus(
  adminUserId: string,
  mediaType: MediaType,
  tmdbId: number,
  tvdbId: number | null,
): Promise<FourKStatus | null> {
  const credential = await getArrCredential(adminUserId, arrInstanceFor(mediaType, true));
  if (!credential) return null;
  const configured = isArrFullyConfigured(credential);
  const config = { baseUrl: credential.baseUrl, apiKey: credential.apiKey };
  if (mediaType === "movie") {
    const movie = await withinBudget(radarr.getMovieByTmdbId(config, tmdbId), null);
    return { configured, status: movie ? deriveRadarrStatus(movie) : "untracked" };
  }
  if (!tvdbId) return { configured, status: "untracked" };
  const series = await withinBudget(sonarr.getSeriesByTvdbId(config, tvdbId), null);
  return { configured, status: series ? deriveSonarrStatus(series) : "untracked" };
}
