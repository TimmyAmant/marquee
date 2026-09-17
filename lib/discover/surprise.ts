import { discoverMovies, discoverTv } from "@/lib/tmdb/client";
import { getTitleLibraryStatus } from "@/lib/integrations/status";
import type { ViewerIdentity } from "@/lib/integrations/library-owner";
import type { MediaType } from "@/lib/db/schema";
import { fail, type CoreResult } from "@/lib/core-result";

export type SurpriseMeParams = {
  displayType: "movie" | "tv" | "all";
  genreId?: number;
  year?: number;
  hideOwned: boolean;
};

const MAX_ATTEMPTS = 5;

function discoverFor(mediaType: MediaType, genreId: number | undefined, year: number | undefined, page: number) {
  return mediaType === "movie"
    ? discoverMovies({ genreId, sort: "popularity", page, year })
    : discoverTv({ genreId, sort: "popularity", page, year });
}

/** Picks one random title from TMDb's full discover result set for the
 * current filters (not just what's currently on screen) — a random page,
 * then a random item on that page, re-rolling a few times if "hide titles
 * you already track" is on and the pick turns out to be owned. Shared by the
 * Surprise me button's server action and POST /api/v1/surprise. */
export async function pickSurprise(
  viewer: ViewerIdentity,
  params: SurpriseMeParams,
): Promise<CoreResult<{ mediaType: MediaType; tmdbId: number }>> {
  const mediaType: MediaType =
    params.displayType === "all" ? (Math.random() < 0.5 ? "movie" : "tv") : params.displayType;

  const first = await discoverFor(mediaType, params.genreId, params.year, 1).catch(() => null);
  if (!first || first.total_results === 0) {
    return fail("not_found", "Nothing matches those filters — try loosening them.");
  }

  const maxPage = Math.min(first.total_pages, 500);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const page = Math.floor(Math.random() * maxPage) + 1;
    const response =
      page === 1 ? first : await discoverFor(mediaType, params.genreId, params.year, page).catch(() => null);
    if (!response || response.results.length === 0) continue;

    const pick = response.results[Math.floor(Math.random() * response.results.length)];

    if (params.hideOwned && viewer.libraryOwnerId) {
      const status = await getTitleLibraryStatus(viewer.libraryOwnerId, mediaType, pick.id, null).catch(
        () => null,
      );
      if (status && status.status !== "untracked") continue;
    }

    return { ok: true, mediaType, tmdbId: pick.id };
  }

  return fail("not_found", "Couldn't find something new — try different filters.");
}
