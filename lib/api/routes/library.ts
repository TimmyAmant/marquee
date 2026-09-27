import { withApi } from "@/lib/api/handler";
import { requireApiAdmin, requireApiUser } from "@/lib/api/auth";
import { invalid } from "@/lib/api/request";
import { msg } from "@/lib/api/errors";
import { iso, statusKey, titleCard } from "@/lib/api/mappers";
import { hdrLabel } from "@/lib/quality";
import { posterActions } from "@/lib/api/poster-actions";
import { libraryIsHdr, libraryResolution, parseLibraryQuery, type RawLibraryQuery } from "@/lib/library/list";
import { storageFullOn } from "@/lib/library/storage";
import { loadLibraryCollections, loadLibraryDuplicates, loadLibraryPage, loadLibraryStorage } from "@/lib/pages/library";
import type { LibraryItem } from "@/lib/library/query";
import { franchiseMissingItems, franchiseRequestableItems } from "@/lib/title-meta";
import type * as Dto from "@/lib/api/types";

// GET /api/v1/library and its /collections-missing, /duplicates and
// /storage siblings — the Library page, backed by the loaders the page
// itself uses (lib/pages/library.ts).

const QUERY_FIELDS = ["type", "status", "source", "resolution", "hdr", "codec", "genre", "year", "q", "sort", "page", "pageSize"] as const;

function rawQuery(url: URL): RawLibraryQuery {
  const raw: RawLibraryQuery = {};
  for (const field of QUERY_FIELDS) {
    const value = url.searchParams.get(field);
    if (value !== null) raw[field] = value;
  }
  return raw;
}

/** A library row for the API. The file path and the arr handle are for the
 * admin: a member's copy has neither. */
export function libraryEntry(item: LibraryItem, extra: { favorited: boolean; isAdmin: boolean }): Dto.LibraryEntry {
  return {
    ...titleCard(item, { status: item.status, favorited: extra.favorited }),
    tvdbId: item.tvdbId,
    source: item.source,
    sizeBytes: item.sizeBytes,
    addedAt: iso(item.addedAt),
    genres: item.genres,
    resolution: libraryResolution(item),
    hdr: libraryIsHdr(item) ? hdrLabel(item.dynamicRange) : null,
    videoCodec: item.videoCodec,
    audioCodec: item.audioCodec,
    quality: item.qualityName,
    filePath: extra.isAdmin ? item.filePath : null,
    episodeCount: item.mediaType === "tv" ? item.episodeCount : null,
    upgradeAvailable: item.qualityCutoffNotMet,
    possibleDuplicate: item.possibleDuplicate,
    arrTracking:
      extra.isAdmin && item.arrId !== null && item.monitored !== null ? { arrId: item.arrId, monitored: item.monitored } : null,
  };
}

export const libraryPageHandler = withApi(async (request): Promise<Dto.LibraryPage> => {
  const ctx = await requireApiUser(request);
  const { query, problem } = parseLibraryQuery(rawQuery(new URL(request.url)), "strict");
  if (problem) {
    throw problem.values
      ? invalid(msg("server.fieldOneOf", { field: problem.field, values: problem.values }))
      : invalid(msg("server.fieldRequired", { field: problem.field }));
  }
  const viewer = await ctx.viewer();
  const data = await loadLibraryPage(viewer, query);
  return {
    page: data.page.page,
    pageSize: data.page.pageSize,
    totalPages: data.page.totalPages,
    totalResults: data.page.totalResults,
    results: data.page.results.map((item) =>
      libraryEntry(item, { favorited: data.favoritedKeys.has(statusKey(item.mediaType, item.tmdbId)), isAdmin: viewer.isAdmin }),
    ),
    summary: {
      movies: data.summary.movieCount,
      series: data.summary.tvCount,
      episodes: data.summary.episodeCount,
      totalBytes: data.summary.totalBytes,
      tracked: data.summary.trackedCount,
    },
    filters: data.filters,
    connected: data.connections.any,
  };
});

export const libraryCollectionsHandler = withApi(async (request): Promise<Dto.ListResponse<Dto.LibraryCollection>> => {
  const ctx = await requireApiUser(request);
  const viewer = await ctx.viewer();
  const data = await loadLibraryCollections(viewer);
  const isAdmin = viewer.isAdmin;
  return {
    results: data.collections.map((collection) => ({
      key: collection.key,
      title: collection.title,
      collectionId: collection.collectionId ?? null,
      collectionFavorited: collection.collectionId !== undefined ? collection.collectionFavorited : null,
      // The same quick-action rule as every other list of cards
      // (lib/api/poster-actions.ts), from the maps the page loaded.
      items: collection.items.map((item) => {
        const status = collection.statusMap.get(statusKey(item.mediaType, item.tmdbId)) ?? null;
        const rules = {
          isAdmin,
          arrConfigured: data.connections.arrConfigured,
          mayRequest: { movie: data.permissions.requestMovies, tv: data.permissions.requestTv },
          blockedKeys: data.blockedKeys,
          requestedKeys: new Set(collection.requestStatusMap.keys()),
        };
        return titleCard(item, {
          status,
          favorited: collection.favoritedIds.has(item.tmdbId),
          ...posterActions(rules, item.mediaType, item.tmdbId, status),
        });
      }),
      missingCount: collection.missing.length,
      addAllMissing: franchiseMissingItems(collection.items, collection.statusMap, data.connections.arrConfigured, isAdmin),
      requestAllMissing: franchiseRequestableItems(
        collection.items,
        collection.statusMap,
        collection.requestStatusMap,
        data.blockedKeys,
        isAdmin,
        data.permissions,
      ),
      requestAllTarget: { mediaType: collection.items[0]?.mediaType ?? "movie", tmdbId: collection.ownedTmdbId },
    })),
  };
});

export const libraryDuplicatesHandler = withApi(async (request): Promise<Dto.ListResponse<Dto.LibraryDuplicate>> => {
  const ctx = await requireApiAdmin(request, msg("server.onlyAdminDuplicates"));
  const groups = await loadLibraryDuplicates(await ctx.viewer());
  return {
    results: groups.map((group) => ({
      mediaType: group.mediaType,
      tmdbId: group.tmdbId,
      name: group.name,
      posterPath: group.posterPath,
      year: group.year,
      reason: group.reason,
      copies: group.copies,
    })),
  };
});

export const libraryStorageHandler = withApi(async (request): Promise<Dto.LibraryStorage> => {
  const ctx = await requireApiUser(request);
  const overview = await loadLibraryStorage(await ctx.viewer());
  return {
    folders: overview.folders,
    totalFreeBytes: overview.totalFreeBytes,
    measuredAt: iso(overview.measuredAt),
    live: overview.live,
    forecast: overview.forecast
      ? {
          daysRemaining: overview.forecast.daysRemaining,
          bytesPerDay: Math.round(overview.forecast.bytesPerDay),
          fullOn: storageFullOn(overview.forecast).toISOString().slice(0, 10),
        }
      : null,
  };
});
