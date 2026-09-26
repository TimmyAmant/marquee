import { discoverForShelf, getTmdbList, type TmdbDiscoverResponse } from "@/lib/tmdb/client";
import { getOrFetchTitle } from "@/lib/tmdb/cache";
import { getTraktClientId } from "@/lib/integrations/app-settings";
import { getTraktItemsPage, parseTraktUrl } from "@/lib/trakt/client";
import { getRecentlyAdded } from "@/lib/library/query";
import type { ViewerIdentity } from "@/lib/integrations/library-owner";
import type { LibraryStatus } from "@/components/status-badge";
import type { MediaType } from "@/lib/db/schema";
import { LIST_TMDB_BATCH, RECENTLY_ADDED_PAGE_SIZE, listTmdbPages, listTotalPages, sliceRecentlyAdded } from "@/lib/discover/lists";
import { TMDB_MAX_PAGE } from "@/lib/discover/paging";
import type { LayoutShelf, ShelfSource } from "@/lib/discover/shelves";
import { interleaveByPopularity } from "@/lib/discover/merge";

// The admin's own Discover rows (Settings → Discover): one page of titles
// for a row — its first 20 on Discover, the rest on its "See all". TMDb
// answers come from Next's fetch cache (an hour) like the built-in rows;
// Trakt's the same way (lib/trakt/client.ts getTraktItemsPage).

export type ShelfItem = {
  mediaType: MediaType;
  tmdbId: number;
  name: string;
  posterPath: string | null;
  year: string | null;
  /** Known already (recently added comes with it); otherwise looked up. */
  status?: LibraryStatus;
};

export type ShelfPage = { items: ShelfItem[]; totalPages: number; totalResults: number };

const EMPTY: ShelfPage = { items: [], totalPages: 1, totalResults: 0 };

/** Titles per page of a Trakt row's See all. */
export const TRAKT_PAGE_SIZE = 40;
/** How deep a Trakt row's See all goes (4,000 titles). */
export const TRAKT_MAX_PAGE = 100;

const yearOf = (date: string | undefined | null) => (date || "").slice(0, 4) || null;

/** The highest See all page a custom row serves. */
export function customShelfMaxPage(kind: string): number {
  switch (kind) {
    case "library":
      return 25;
    case "traktList":
      return TRAKT_MAX_PAGE;
    case "tmdbList":
      return TMDB_MAX_PAGE;
    default:
      return Math.floor(TMDB_MAX_PAGE / LIST_TMDB_BATCH);
  }
}

function tmdbFilter(kind: string, source: ShelfSource) {
  const id = source.tmdbId ?? undefined;
  switch (kind) {
    case "keyword":
      return { keywordId: id };
    case "genre":
      return { genreId: id };
    case "company":
      return { companyId: id };
    case "network":
      return { networkId: id };
    default:
      return null;
  }
}

function fromDiscover(mediaType: MediaType, results: TmdbDiscoverResponse["results"]): (ShelfItem & { popularity: number })[] {
  return results.map((item) => ({
    mediaType,
    tmdbId: item.id,
    name: (mediaType === "movie" ? item.title : item.name) || item.title || item.name || "",
    posterPath: item.poster_path,
    year: yearOf(mediaType === "movie" ? item.release_date : item.first_air_date),
    popularity: item.popularity ?? 0,
  }));
}

async function discoverPage(kind: string, source: ShelfSource, page: number): Promise<ShelfPage> {
  const filter = tmdbFilter(kind, source);
  if (!filter || !source.tmdbId) return EMPTY;
  const types: MediaType[] =
    kind === "network" ? ["tv"] : source.mediaType === "movie" ? ["movie"] : source.mediaType === "tv" ? ["tv"] : ["movie", "tv"];
  const empty: TmdbDiscoverResponse = { page, results: [], total_pages: 0, total_results: 0 };
  const perType = await Promise.all(
    types.map(async (type) => {
      const responses = await Promise.all(
        listTmdbPages(page).map((p) => discoverForShelf(type, filter, p).catch(() => empty)),
      );
      return {
        items: fromDiscover(type, responses.flatMap((r) => r.results)),
        totalPages: Math.max(0, ...responses.map((r) => r.total_pages ?? 0)),
        totalResults: Math.max(0, ...responses.map((r) => r.total_results ?? 0)),
      };
    }),
  );
  // Movies and series of one keyword or studio, mixed by popularity.
  const items = perType.length === 1 ? perType[0].items : interleaveByPopularity(perType.map((t) => t.items));
  return {
    items: items.map(({ popularity: _popularity, ...item }) => item),
    totalPages: listTotalPages(Math.max(...perType.map((t) => t.totalPages))),
    totalResults: perType.reduce((sum, t) => sum + t.totalResults, 0),
  };
}

async function tmdbListPage(source: ShelfSource, page: number): Promise<ShelfPage> {
  if (!source.tmdbId) return EMPTY;
  const list = await getTmdbList(source.tmdbId, page).catch(() => null);
  if (!list) return EMPTY;
  return {
    items: list.items
      .filter((item) => item.media_type === "movie" || item.media_type === "tv")
      .map((item) => ({
        mediaType: item.media_type as MediaType,
        tmdbId: item.id,
        name: item.title || item.name || "",
        posterPath: item.poster_path,
        year: yearOf(item.release_date || item.first_air_date),
      })),
    totalPages: Math.max(1, Math.min(list.total_pages ?? 1, TMDB_MAX_PAGE)),
    totalResults: list.total_results ?? list.items.length,
  };
}

/** Looks titles up a few at a time (the database first, TMDb for the rest),
 * since Trakt only sends names and ids. */
async function lookUpTitles(entries: { mediaType: MediaType; tmdbId: number; name: string; year: number | null }[]) {
  const out: ShelfItem[] = [];
  for (let i = 0; i < entries.length; i += 10) {
    const batch = entries.slice(i, i + 10);
    const found = await Promise.all(batch.map((e) => getOrFetchTitle(e.mediaType, e.tmdbId).catch(() => null)));
    batch.forEach((entry, index) => {
      const title = found[index];
      out.push({
        mediaType: entry.mediaType,
        tmdbId: entry.tmdbId,
        name: title?.name ?? entry.name,
        posterPath: title?.posterPath ?? null,
        year: yearOf(title?.releaseDate ?? title?.firstAirDate) ?? (entry.year ? String(entry.year) : null),
      });
    });
  }
  return out;
}

async function traktPage(source: ShelfSource, page: number, pageSize: number): Promise<ShelfPage> {
  const list = source.url ? parseTraktUrl(source.url) : null;
  const clientId = await getTraktClientId();
  if (!list || !clientId) return EMPTY;
  const result = await getTraktItemsPage({ clientId }, list, page, pageSize).catch(() => null);
  if (!result) return EMPTY;
  const entries = result.items.flatMap((item) => {
    const entity = item.movie ?? item.show;
    const tmdbId = entity?.ids.tmdb;
    if (!entity || !tmdbId) return [];
    return [{ mediaType: (item.type === "movie" ? "movie" : "tv") as MediaType, tmdbId, name: entity.title, year: entity.year }];
  });
  return {
    items: await lookUpTitles(entries),
    totalPages: Math.max(1, Math.min(result.pageCount, TRAKT_MAX_PAGE)),
    totalResults: result.itemCount,
  };
}

async function libraryPage(source: ShelfSource, page: number, viewer: ViewerIdentity): Promise<ShelfPage> {
  if (!viewer.libraryOwnerId) return EMPTY;
  const mediaType = source.mediaType === "movie" || source.mediaType === "tv" ? source.mediaType : undefined;
  const newest = await getRecentlyAdded(viewer.libraryOwnerId, page * RECENTLY_ADDED_PAGE_SIZE + 1, mediaType);
  const slice = sliceRecentlyAdded(newest, page);
  return {
    items: slice.items.map((item) => ({
      mediaType: item.mediaType,
      tmdbId: item.tmdbId,
      name: item.name,
      posterPath: item.posterPath,
      year: item.year,
      status: item.status ?? undefined,
    })),
    totalPages: slice.totalPages,
    totalResults: slice.totalResults,
  };
}

/** One page of a custom row: page 1 is also what Discover shows (its first
 * 20). Fails soft to an empty page, like the built-in rows. `pageSize` only
 * applies to Trakt (the Discover row asks for just 20). */
export async function fetchCustomShelfPage(
  shelf: Pick<LayoutShelf, "kind" | "source">,
  page: number,
  viewer: ViewerIdentity,
  options: { pageSize?: number } = {},
): Promise<ShelfPage> {
  const source = shelf.source;
  if (!source) return EMPTY;
  try {
    switch (shelf.kind) {
      case "keyword":
      case "genre":
      case "company":
      case "network":
        return await discoverPage(shelf.kind, source, page);
      case "tmdbList":
        return await tmdbListPage(source, page);
      case "traktList":
        return await traktPage(source, page, options.pageSize ?? TRAKT_PAGE_SIZE);
      case "library":
        return await libraryPage(source, page, viewer);
      default:
        return EMPTY;
    }
  } catch (err) {
    console.error(`[discover] couldn't load the ${shelf.kind} row:`, err);
    return EMPTY;
  }
}
