import {
  searchMulti,
  searchCompany,
  searchKeyword,
  getMovieGenres,
  getTvGenres,
  discoverMovies,
  discoverTv,
  discoverMoviesByKeyword,
  discoverTvByKeyword,
  type TmdbDiscoverResult,
} from "@/lib/tmdb/client";
import { getLibraryStatusMap } from "@/lib/library/query";
import { dedupeCompanies } from "@/lib/tmdb/company-groups";
import { getArrCredential, isArrFullyConfigured } from "@/lib/integrations/credentials";
import { getFavoritedTmdbIds } from "@/lib/favorites/query";
import type { ViewerIdentity } from "@/lib/integrations/library-owner";
import type { LibraryStatus } from "@/components/status-badge";
import type { MediaType } from "@/lib/db/schema";
import { findGenreMatch, normalizeForThemeMatch } from "@/lib/search/theme";

export type SearchThemeItem = {
  tmdbId: number;
  mediaType: MediaType;
  name: string;
  posterPath: string | null;
  year: string | null;
};

function toThemeItem(item: TmdbDiscoverResult, mediaType: MediaType): SearchThemeItem {
  return {
    tmdbId: item.id,
    mediaType,
    name: item.title || item.name || "",
    posterPath: item.poster_path,
    year: (item.release_date || item.first_air_date || "").slice(0, 4) || null,
  };
}

/**
 * Everything /search?q= shows for a non-empty query — people, studios, title
 * matches, and a genre/keyword "theme" row — with library status, favorites
 * and quick-add eligibility. Shared by app/search/page.tsx and
 * GET /api/v1/search.
 */
export async function loadSearchResults(viewer: ViewerIdentity, query: string) {
  const normalized = normalizeForThemeMatch(query);

  const [multi, companies, movieGenres, tvGenres] = await Promise.all([
    searchMulti(query).catch(() => null),
    searchCompany(query).catch(() => null),
    getMovieGenres().catch(() => ({ genres: [] })),
    getTvGenres().catch(() => ({ genres: [] })),
  ]);

  const people = multi?.results.filter((r) => r.media_type === "person") ?? [];
  const titleResults = multi?.results.filter((r) => r.media_type === "movie" || r.media_type === "tv") ?? [];
  const companyResults = dedupeCompanies(companies?.results ?? []);

  const movieGenreMatch = findGenreMatch(movieGenres.genres, normalized);
  const tvGenreMatch = findGenreMatch(tvGenres.genres, normalized);

  let themeLabel: string | null = null;
  let themeItems: SearchThemeItem[] = [];

  if (movieGenreMatch || tvGenreMatch) {
    const [movieRes, tvRes] = await Promise.all([
      movieGenreMatch
        ? discoverMovies({ genreId: movieGenreMatch.id, sort: "popularity" }).catch(() => null)
        : null,
      tvGenreMatch
        ? discoverTv({ genreId: tvGenreMatch.id, sort: "popularity" }).catch(() => null)
        : null,
    ]);
    themeItems = [
      ...(movieRes?.results.map((i) => toThemeItem(i, "movie")) ?? []),
      ...(tvRes?.results.map((i) => toThemeItem(i, "tv")) ?? []),
    ];
    themeLabel = (movieGenreMatch ?? tvGenreMatch)!.name;
  } else if (normalized) {
    // No genre matched this query (e.g. "national disaster") — try it as a
    // TMDb keyword/theme tag instead of a literal title search.
    const keywordResults = await searchKeyword(normalized).catch(() => null);
    const lowerNormalized = normalized.toLowerCase();
    const keyword =
      keywordResults?.results.find((k) => k.name.toLowerCase() === lowerNormalized) ??
      keywordResults?.results[0] ??
      null;
    if (keyword) {
      const [movieRes, tvRes] = await Promise.all([
        discoverMoviesByKeyword(keyword.id).catch(() => null),
        discoverTvByKeyword(keyword.id).catch(() => null),
      ]);
      themeItems = [
        ...(movieRes?.results.map((i) => toThemeItem(i, "movie")) ?? []),
        ...(tvRes?.results.map((i) => toThemeItem(i, "tv")) ?? []),
      ];
      themeLabel = keyword.name;
    }
  }

  const hasResults =
    people.length + titleResults.length + companyResults.length + themeItems.length > 0;

  const allMovieIds = [
    ...titleResults.filter((t) => t.media_type === "movie").map((t) => t.id),
    ...themeItems.filter((t) => t.mediaType === "movie").map((t) => t.tmdbId),
  ];
  const allTvIds = [
    ...titleResults.filter((t) => t.media_type === "tv").map((t) => t.id),
    ...themeItems.filter((t) => t.mediaType === "tv").map((t) => t.tmdbId),
  ];

  const [
    statusMap,
    radarrCredential,
    sonarrCredential,
    favoritedPersonIds,
    favoritedCompanyIds,
    favoritedMovieIds,
    favoritedTvIds,
  ] = viewer.libraryOwnerId
    ? await Promise.all([
        getLibraryStatusMap(viewer.libraryOwnerId, [
          ...titleResults.map((t) => ({ mediaType: t.media_type as MediaType, tmdbId: t.id })),
          ...themeItems.map((t) => ({ mediaType: t.mediaType, tmdbId: t.tmdbId })),
        ]),
        getArrCredential(viewer.userId, "radarr"),
        getArrCredential(viewer.userId, "sonarr"),
        getFavoritedTmdbIds(
          viewer.userId,
          "person",
          people.map((p) => p.id),
        ),
        getFavoritedTmdbIds(
          viewer.userId,
          "company",
          companyResults.map((c) => c.tmdbId),
        ),
        getFavoritedTmdbIds(viewer.userId, "movie", allMovieIds),
        getFavoritedTmdbIds(viewer.userId, "tv", allTvIds),
      ])
    : [
        new Map<string, LibraryStatus>(),
        null,
        null,
        new Set<number>(),
        new Set<number>(),
        new Set<number>(),
        new Set<number>(),
      ];

  const arrConfigured = {
    movie: isArrFullyConfigured(radarrCredential),
    tv: isArrFullyConfigured(sonarrCredential),
  };
  function favoritedTitle(mediaType: MediaType, tmdbId: number) {
    return mediaType === "movie" ? favoritedMovieIds.has(tmdbId) : favoritedTvIds.has(tmdbId);
  }

  return {
    people,
    companyResults,
    titleResults,
    themeLabel,
    themeItems,
    hasResults,
    statusMap,
    arrConfigured,
    favoritedPersonIds,
    favoritedCompanyIds,
    favoritedTitle,
  };
}
