import { withApi } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/api/auth";
import { requireTmdbConfigured } from "@/lib/api/guards";
import { invalid, queryBool, queryInt } from "@/lib/api/request";
import { statusKey, titleCard } from "@/lib/api/mappers";
import { fetchDiscoverItems } from "@/app/discover/fetch-items";
import { loadBecauseYouWatched, loadBrowseFilters } from "@/lib/pages/browse";
import type { BrowseExtras, Paginated, TitleCard } from "@/lib/api/types";
import type { DiscoverSort } from "@/lib/tmdb/client";
import type { MediaType } from "@/lib/db/schema";

// GET /api/v1/movies and /api/v1/series (+ /extras) — the Movies and Series
// pages, backed by the exact loaders those pages use.

const SORTS: DiscoverSort[] = ["popularity", "top_rated", "newest"];

function parseSort(url: URL): DiscoverSort {
  const raw = url.searchParams.get("sort");
  if (raw === null || raw === "") return "popularity";
  if (!(SORTS as string[]).includes(raw)) throw invalid(`"sort" must be one of ${SORTS.join(", ")}.`);
  return raw as DiscoverSort;
}

function parseFilters(url: URL, lockedType: MediaType) {
  const genreId = queryInt(url, "genre", { min: 1 });
  const year = queryInt(url, "year", { min: 1800, max: 3000 });
  // Network filtering is TV-only, as on the website (a stray ?network= on
  // movies is ignored rather than rejected).
  const networkId = lockedType === "tv" ? queryInt(url, "network", { min: 1 }) : undefined;
  return { genreId, year, networkId };
}

export function browseResultsHandler(lockedType: MediaType) {
  return withApi(async (request): Promise<Paginated<TitleCard>> => {
    const ctx = await requireApiUser(request);

    const url = new URL(request.url);
    const sort = parseSort(url);
    const { genreId, year, networkId } = parseFilters(url, lockedType);
    // Signed in, the website hides titles you already track unless ?hideOwned=0.
    const hideOwned = queryBool(url, "hideOwned") ?? true;
    const page = queryInt(url, "page", { min: 1, max: 500 }) ?? 1;
    await requireTmdbConfigured();

    const viewer = await ctx.viewer();
    const result = await fetchDiscoverItems({ lockedType, sort, genreId, year, networkId, hideOwned, page }, viewer);

    return {
      page,
      totalPages: result.totalPages,
      totalResults: result.totalResults,
      results: result.items.map((item) =>
        titleCard(item, {
          subtitle: item.meta,
          overview: item.overview,
          rating: item.rating,
          status: item.status ?? null,
          favorited: item.favorited,
          canQuickAdd: item.canQuickAdd,
        }),
      ),
    };
  });
}

export function browseExtrasHandler(lockedType: MediaType) {
  return withApi(async (request): Promise<BrowseExtras> => {
    const ctx = await requireApiUser(request);

    const url = new URL(request.url);
    const { genreId, year, networkId } = parseFilters(url, lockedType);
    await requireTmdbConfigured();
    const viewer = await ctx.viewer();

    const [{ genresForFilter, network }, byw] = await Promise.all([
      loadBrowseFilters(lockedType, networkId),
      loadBecauseYouWatched(viewer, lockedType, { genreId, year }),
    ]);

    return {
      genres: genresForFilter.map((g) => ({ id: g.id, name: g.name })),
      network: network ? { tmdbId: network.id, name: network.name, logoPath: network.logo_path } : null,
      becauseYouWatched: byw.becauseYouWatched
        ? {
            title: byw.becauseYouWatched.title,
            items: byw.becauseYouWatched.items.map((item) => {
              const status = byw.statusMap.get(statusKey(item.mediaType, item.tmdbId)) ?? null;
              return titleCard(item, {
                status,
                favorited: byw.favoritedIds.has(item.tmdbId),
                canQuickAdd: byw.arrConfigured && !status,
              });
            }),
          }
        : null,
    };
  });
}
