import {
  searchMovies,
  searchTv,
  searchPeople,
  searchCompany,
  searchKeyword,
  getMovieGenres,
  getTvGenres,
  getNetworkDetails,
  discoverMovies,
  discoverTv,
  discoverMoviesByKeyword,
  discoverTvByKeyword,
  type TmdbDiscoverResult,
  type TmdbPagedSearch,
  type TmdbPersonSearchResult,
  type TmdbTitleSearchResult,
} from "@/lib/tmdb/client";
import { getLibraryStatusMap } from "@/lib/library/query";
import { isUnwanted } from "@/lib/library/status-tone";
import { dedupeCompanies } from "@/lib/tmdb/company-groups";
import { CURATED_NETWORKS } from "@/lib/tmdb/curated-companies";
import { getArrCredential, isArrFullyConfigured } from "@/lib/integrations/credentials";
import { getFavoritedTmdbIds } from "@/lib/favorites/query";
import type { ViewerIdentity } from "@/lib/integrations/library-owner";
import type { LibraryStatus } from "@/components/status-badge";
import type { MediaType } from "@/lib/db/schema";
import { findGenreMatch, normalizeForThemeMatch } from "@/lib/search/theme";
import {
  hasExactName,
  matchNetworks,
  rankCompanies,
  rankPeople,
  rankTitles,
  searchText,
  themePlacement,
  type SearchSectionKind,
} from "@/lib/search/rank";
import { TMDB_MAX_PAGE } from "@/lib/discover/paging";

export type { SearchSectionKind };

/** A movie or series on the search page, ready for a poster card. */
export type SearchTitleCard = {
  mediaType: MediaType;
  tmdbId: number;
  name: string;
  posterPath: string | null;
  year: string | null;
  meta: string | null;
  rating: number | null;
  overview: string | null;
  status?: LibraryStatus;
  favorited: boolean;
  canQuickAdd: boolean;
};

export type SearchPersonCard = {
  tmdbId: number;
  name: string;
  profilePath: string | null;
  knownForDepartment: string | null;
  /** Up to three titles they're known for, best known first. */
  knownFor: string[];
  favorited: boolean;
};

export type SearchCompanyCard = {
  /** A studio opens its own page; a network opens Series filtered to it. */
  kind: "studio" | "network";
  tmdbId: number;
  name: string;
  logoPath: string | null;
  /** Networks can't be favorited. */
  favorited: boolean;
};

export type SearchSectionPage<T> = {
  items: T[];
  page: number;
  totalPages: number;
  /** Everything TMDb has for this kind, not just this page — the heading's count. */
  totalResults: number;
};

type RawTitle = { mediaType: MediaType; tmdbId: number; name: string; originalName: string | null; posterPath: string | null; year: string | null; overview: string | null; rating: number | null; popularity: number | null };

function rawTitle(item: TmdbTitleSearchResult | TmdbDiscoverResult, mediaType: MediaType): RawTitle {
  const original = item as TmdbTitleSearchResult;
  return {
    mediaType,
    tmdbId: item.id,
    name: item.title || item.name || "",
    originalName: original.original_title || original.original_name || null,
    posterPath: item.poster_path ?? null,
    year: (item.release_date || item.first_air_date || "").slice(0, 4) || null,
    overview: item.overview || null,
    rating: item.vote_average ?? null,
    popularity: (item as { popularity?: number }).popularity ?? null,
  };
}

function rawPerson(person: TmdbPersonSearchResult) {
  return {
    tmdbId: person.id,
    name: person.name ?? "",
    profilePath: person.profile_path ?? null,
    knownForDepartment: person.known_for_department ?? null,
    knownFor: (person.known_for ?? [])
      .map((credit) => credit.title || credit.name || "")
      .filter(Boolean)
      .slice(0, 3),
    popularity: person.popularity ?? null,
  };
}

const EMPTY_PAGE = { page: 1, results: [], total_pages: 0, total_results: 0 };

function dedupeBy<T>(items: readonly T[], key: (item: T) => string | number): T[] {
  const seen = new Set<string | number>();
  return items.filter((item) => {
    const k = key(item);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * One page of movies or series. TMDb is searched for the query without a
 * trailing year ("dune 2021" → "dune"); on page 1 the whole query is
 * searched too (for titles that end in a number, "Blade Runner 2049"), and
 * the page is re-ranked — exact title first, the hinted year ahead.
 */
async function searchTitlesPage(query: string, mediaType: MediaType, page: number) {
  const search = mediaType === "movie" ? searchMovies : searchTv;
  const text = searchText(query);
  const [primary, whole] = await Promise.all([
    search(text, page).catch(() => EMPTY_PAGE as TmdbPagedSearch<TmdbTitleSearchResult>),
    page === 1 && text !== query.trim()
      ? search(query.trim(), 1).catch(() => EMPTY_PAGE as TmdbPagedSearch<TmdbTitleSearchResult>)
      : null,
  ]);
  const merged = dedupeBy(
    [...(whole?.results ?? []), ...primary.results].map((item) => rawTitle(item, mediaType)),
    (item) => item.tmdbId,
  );
  return {
    items: page === 1 ? rankTitles(merged, query) : merged,
    page,
    totalPages: Math.min(Math.max(primary.total_pages, whole?.total_pages ?? 0), TMDB_MAX_PAGE),
    totalResults: Math.max(primary.total_results, whole?.total_results ?? 0),
  };
}

async function searchPeoplePage(query: string, page: number) {
  const res = await searchPeople(searchText(query), page).catch(() => EMPTY_PAGE as TmdbPagedSearch<TmdbPersonSearchResult>);
  const people = res.results.map(rawPerson);
  return {
    items: page === 1 ? rankPeople(people, query) : people,
    page,
    totalPages: Math.min(res.total_pages, TMDB_MAX_PAGE),
    totalResults: res.total_results,
  };
}

/** Studios (TMDb company search) and, on page 1, the networks Discover
 * knows that match — TMDb has no network search. */
async function searchCompaniesPage(query: string, page: number) {
  const text = searchText(query);
  const networkMatches = page === 1 ? matchNetworks(CURATED_NETWORKS, text) : [];
  const [companies, networks] = await Promise.all([
    searchCompany(text, page).catch(() => null),
    Promise.all(
      networkMatches.map(async (network) => {
        const details = await getNetworkDetails(network.id).catch(() => null);
        return {
          kind: "network" as const,
          tmdbId: network.id,
          name: details?.name ?? network.name,
          logoPath: details?.logo_path ?? null,
        };
      }),
    ),
  ]);
  const studios = dedupeCompanies(companies?.results ?? []).map((company) => ({ kind: "studio" as const, ...company }));
  const items = [...networks, ...studios];
  const totalPages = Math.min(companies?.total_pages ?? 0, TMDB_MAX_PAGE);
  // TMDb's company search doesn't always say how many there are in all.
  const studioTotal = companies?.total_results ?? (totalPages > 1 ? totalPages * 20 : studios.length);
  return {
    items: page === 1 ? rankCompanies(items, text) : items,
    page,
    totalPages: Math.max(totalPages, 1),
    totalResults: studioTotal + networks.length,
  };
}

/** Library status, favorites and "+ Add" for everything on a page. */
async function enrich(
  viewer: ViewerIdentity,
  titles: readonly RawTitle[],
  people: readonly { tmdbId: number }[],
  companies: readonly { kind: "studio" | "network"; tmdbId: number }[],
) {
  const movieIds = titles.filter((t) => t.mediaType === "movie").map((t) => t.tmdbId);
  const tvIds = titles.filter((t) => t.mediaType === "tv").map((t) => t.tmdbId);
  const studioIds = companies.filter((c) => c.kind === "studio").map((c) => c.tmdbId);

  const ownerId = viewer.libraryOwnerId;
  const [statusMap, radarr, sonarr, favPeople, favCompanies, favMovies, favTv] = viewer.userId
    ? await Promise.all([
        ownerId && titles.length > 0
          ? getLibraryStatusMap(ownerId, titles.map((t) => ({ mediaType: t.mediaType, tmdbId: t.tmdbId })))
          : new Map<string, LibraryStatus>(),
        getArrCredential(viewer.userId, "radarr"),
        getArrCredential(viewer.userId, "sonarr"),
        people.length > 0 ? getFavoritedTmdbIds(viewer.userId, "person", people.map((p) => p.tmdbId)) : new Set<number>(),
        studioIds.length > 0 ? getFavoritedTmdbIds(viewer.userId, "company", studioIds) : new Set<number>(),
        movieIds.length > 0 ? getFavoritedTmdbIds(viewer.userId, "movie", movieIds) : new Set<number>(),
        tvIds.length > 0 ? getFavoritedTmdbIds(viewer.userId, "tv", tvIds) : new Set<number>(),
      ])
    : [new Map<string, LibraryStatus>(), null, null, new Set<number>(), new Set<number>(), new Set<number>(), new Set<number>()];

  const arrConfigured: Record<MediaType, boolean> = {
    movie: isArrFullyConfigured(radarr),
    tv: isArrFullyConfigured(sonarr),
  };

  const title = (item: RawTitle): SearchTitleCard => {
    const status = statusMap.get(`${item.mediaType}:${item.tmdbId}`);
    return {
      mediaType: item.mediaType,
      tmdbId: item.tmdbId,
      name: item.name,
      posterPath: item.posterPath,
      year: item.year,
      meta: null,
      rating: item.rating,
      overview: item.overview,
      status,
      favorited: (item.mediaType === "movie" ? favMovies : favTv).has(item.tmdbId),
      canQuickAdd: Boolean(viewer.userId) && arrConfigured[item.mediaType] && isUnwanted(status),
    };
  };

  return {
    arrConfigured,
    statusMap,
    title,
    personFavorited: (id: number) => favPeople.has(id),
    companyFavorited: (kind: "studio" | "network", id: number) => kind === "studio" && favCompanies.has(id),
  };
}

type Theme = { label: string; isGenre: boolean; items: RawTitle[] };

/** A genre ("horror") or TMDb keyword ("natural disaster") the query names:
 * that theme's popular titles, movies and series together. */
async function findTheme(query: string): Promise<Theme | null> {
  const normalized = normalizeForThemeMatch(query);
  if (!normalized) return null;
  const [movieGenres, tvGenres] = await Promise.all([
    getMovieGenres().catch(() => ({ genres: [] })),
    getTvGenres().catch(() => ({ genres: [] })),
  ]);
  const movieGenreMatch = findGenreMatch(movieGenres.genres, normalized);
  const tvGenreMatch = findGenreMatch(tvGenres.genres, normalized);

  if (movieGenreMatch || tvGenreMatch) {
    const [movieRes, tvRes] = await Promise.all([
      movieGenreMatch ? discoverMovies({ genreId: movieGenreMatch.id, sort: "popularity" }).catch(() => null) : null,
      tvGenreMatch ? discoverTv({ genreId: tvGenreMatch.id, sort: "popularity" }).catch(() => null) : null,
    ]);
    return {
      label: (movieGenreMatch ?? tvGenreMatch)!.name,
      isGenre: true,
      items: [
        ...(movieRes?.results.map((i) => rawTitle(i, "movie")) ?? []),
        ...(tvRes?.results.map((i) => rawTitle(i, "tv")) ?? []),
      ],
    };
  }

  // No genre matched this query (e.g. "natural disaster") — try it as a
  // TMDb keyword/theme tag instead of a literal title search.
  const keywordResults = await searchKeyword(normalized).catch(() => null);
  const lowerNormalized = normalized.toLowerCase();
  const keyword =
    keywordResults?.results.find((k) => k.name.toLowerCase() === lowerNormalized) ?? keywordResults?.results[0] ?? null;
  if (!keyword) return null;
  const [movieRes, tvRes] = await Promise.all([
    discoverMoviesByKeyword(keyword.id).catch(() => null),
    discoverTvByKeyword(keyword.id).catch(() => null),
  ]);
  return {
    label: keyword.name,
    isGenre: false,
    items: [
      ...(movieRes?.results.map((i) => rawTitle(i, "movie")) ?? []),
      ...(tvRes?.results.map((i) => rawTitle(i, "tv")) ?? []),
    ],
  };
}

export type SearchResultsData = {
  movies: SearchSectionPage<SearchTitleCard>;
  series: SearchSectionPage<SearchTitleCard>;
  people: SearchSectionPage<SearchPersonCard>;
  /** Studios and networks, one section. */
  companies: SearchSectionPage<SearchCompanyCard>;
  theme: { label: string; placement: "first" | "last"; items: SearchTitleCard[] } | null;
  hasResults: boolean;
  arrConfigured: Record<MediaType, boolean>;
};

/**
 * Everything /search?q= shows for a non-empty query, section by section in
 * the page's order — movies, TV shows, people, studios & networks — plus a
 * genre/keyword "theme" section, each ranked (lib/search/rank.ts) and with
 * library status, favorites and quick-add eligibility. Shared by
 * app/search/page.tsx and GET /api/v1/search.
 */
export async function loadSearchResults(viewer: ViewerIdentity, query: string): Promise<SearchResultsData> {
  const [movies, series, people, companies, theme] = await Promise.all([
    searchTitlesPage(query, "movie", 1),
    searchTitlesPage(query, "tv", 1),
    searchPeoplePage(query, 1),
    searchCompaniesPage(query, 1),
    findTheme(query).catch(() => null),
  ]);

  const themeItems = theme?.items ?? [];
  const extra = await enrich(viewer, [...movies.items, ...series.items, ...themeItems], people.items, companies.items);

  const exactMatchElsewhere = hasExactName(
    [
      ...movies.items.map((t) => t.name),
      ...series.items.map((t) => t.name),
      ...people.items.map((p) => p.name),
      ...companies.items.map((c) => c.name),
    ],
    normalizeForThemeMatch(query),
  );

  const result: SearchResultsData = {
    movies: { ...movies, items: movies.items.map(extra.title) },
    series: { ...series, items: series.items.map(extra.title) },
    people: {
      ...people,
      items: people.items.map(({ popularity: _popularity, ...person }) => ({ ...person, favorited: extra.personFavorited(person.tmdbId) })),
    },
    companies: {
      ...companies,
      items: companies.items.map((company) => ({ ...company, favorited: extra.companyFavorited(company.kind, company.tmdbId) })),
    },
    theme:
      theme && themeItems.length > 0
        ? {
            label: theme.label,
            placement: themePlacement({
              query: normalizeForThemeMatch(query),
              label: theme.label,
              isGenre: theme.isGenre,
              exactMatchElsewhere,
            }),
            items: themeItems.map(extra.title),
          }
        : null,
    hasResults: false,
    arrConfigured: extra.arrConfigured,
  };
  result.hasResults =
    result.movies.items.length + result.series.items.length + result.people.items.length + result.companies.items.length > 0 ||
    (result.theme?.items.length ?? 0) > 0;
  return result;
}

export type SearchSectionData =
  | ({ kind: "movie" } & SearchSectionPage<SearchTitleCard>)
  | ({ kind: "tv" } & SearchSectionPage<SearchTitleCard>)
  | ({ kind: "person" } & SearchSectionPage<SearchPersonCard>)
  | ({ kind: "company" } & SearchSectionPage<SearchCompanyCard>);

/** One page of one section — its "See all" (the website's /search?q=&type=,
 * GET /api/v1/search/{section}). Page 1 matches the section on the results page. */
export async function loadSearchSection(
  viewer: ViewerIdentity,
  query: string,
  kind: SearchSectionKind,
  page: number,
): Promise<SearchSectionData> {
  if (kind === "movie" || kind === "tv") {
    const res = await searchTitlesPage(query, kind, page);
    const extra = await enrich(viewer, res.items, [], []);
    return { kind, ...res, items: res.items.map(extra.title) };
  }
  if (kind === "person") {
    const res = await searchPeoplePage(query, page);
    const extra = await enrich(viewer, [], res.items, []);
    return {
      kind,
      ...res,
      items: res.items.map(({ popularity: _popularity, ...person }) => ({ ...person, favorited: extra.personFavorited(person.tmdbId) })),
    };
  }
  const res = await searchCompaniesPage(query, page);
  const extra = await enrich(viewer, [], [], res.items);
  return {
    kind,
    ...res,
    items: res.items.map((company) => ({ ...company, favorited: extra.companyFavorited(company.kind, company.tmdbId) })),
  };
}

/** `?type=` on /search and the API's section names, to a section. */
export function parseSearchSection(value: string | null | undefined): SearchSectionKind | null {
  switch (value) {
    case "movie":
    case "movies":
      return "movie";
    case "tv":
    case "series":
      return "tv";
    case "person":
    case "people":
      return "person";
    case "company":
    case "studios":
      return "company";
    default:
      return null;
  }
}
