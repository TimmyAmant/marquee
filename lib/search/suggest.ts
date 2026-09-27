import { getNetworkDetails, searchCompany, searchMulti } from "@/lib/tmdb/client";
import { getLibraryStatusMap } from "@/lib/library/query";
import { dedupeCompanies } from "@/lib/tmdb/company-groups";
import { CURATED_NETWORKS } from "@/lib/tmdb/curated-companies";
import type { LibraryStatus } from "@/components/status-badge";
import {
  matchNetworks,
  nameMatchScore,
  parseQuery,
  rankCompanies,
  rankPeople,
  rankTitles,
  searchText,
} from "@/lib/search/rank";

import { SUGGESTION_LIMITS, type SuggestionKind } from "@/lib/search/suggestion-groups";

export type SearchSuggestionKind = SuggestionKind;

export type SearchSuggestion = {
  id: number;
  mediaType: SearchSuggestionKind;
  name: string;
  /** A poster for titles, a photo for people, a logo for studios/networks. */
  posterPath: string | null;
  /** The year for titles, the known-for department for people, null for
   * studios and networks. */
  subtitle: string | null;
  /** The viewer's library status for a movie/series (the same local lookup
   * poster cards use — never a live Sonarr/Radarr call). Absent otherwise. */
  status?: LibraryStatus;
};

type MultiResult = Awaited<ReturnType<typeof searchMulti>>["results"][number];

/**
 * Pure: TMDb's mixed results (and any studios/networks) as the type-ahead
 * list — grouped movies, TV shows, people, studios & networks, each group
 * ranked (exact name first, a year in the query lifting that year's title)
 * and capped at SUGGESTION_LIMITS.
 */
export function groupSuggestions(
  query: string,
  multi: readonly MultiResult[],
  companies: readonly { kind: "company" | "network"; id: number; name: string; logoPath: string | null }[] = [],
): SearchSuggestion[] {
  const titles = (mediaType: "movie" | "tv") =>
    rankTitles(
      multi
        .filter((r) => r.media_type === mediaType)
        .map((r) => ({
          id: r.id,
          name: r.title || r.name || "",
          year: (r.release_date || r.first_air_date || "").slice(0, 4) || null,
          posterPath: r.poster_path ?? null,
          popularity: r.popularity ?? null,
        })),
      query,
    )
      .slice(0, SUGGESTION_LIMITS[mediaType])
      .map((t): SearchSuggestion => ({ id: t.id, mediaType, name: t.name, posterPath: t.posterPath, subtitle: t.year }));

  const people = rankPeople(
    multi
      .filter((r) => r.media_type === "person")
      .map((r) => ({
        id: r.id,
        name: r.name || r.title || "",
        posterPath: r.profile_path ?? null,
        subtitle: r.known_for_department ?? null,
        popularity: r.popularity ?? null,
      })),
    query,
  )
    .slice(0, SUGGESTION_LIMITS.person)
    .map((p): SearchSuggestion => ({ id: p.id, mediaType: "person", name: p.name, posterPath: p.posterPath, subtitle: p.subtitle }));

  // Only studios/networks whose name starts with what was typed: TMDb's
  // company search is loose, and a stray "Dune Films Ltd." isn't worth a row.
  const q = parseQuery(searchText(query));
  const brands = rankCompanies(
    companies
      .filter((c) => nameMatchScore(c.name, q) >= 500 || c.kind === "network")
      .map((c) => ({ ...c, kind: c.kind === "network" ? ("network" as const) : ("studio" as const) })),
    searchText(query),
  )
    .slice(0, SUGGESTION_LIMITS.company)
    .map((c): SearchSuggestion => ({
      id: c.id,
      mediaType: c.kind === "network" ? "network" : "company",
      name: c.name,
      posterPath: c.logoPath,
      subtitle: null,
    }));

  return [...titles("movie"), ...titles("tv"), ...people, ...brands];
}

/** Type-ahead suggestions for the header search bar — shared by
 * /api/search/suggest (web) and GET /api/v1/search/suggest. Queries shorter
 * than two characters, and any TMDb failure, yield an empty list.
 * `libraryOwnerId` is whose library the viewer sees; without it titles get
 * no `status`. Studios and networks only with `includeCompanies` (the API
 * asks for them with `?include=`, so an older app never gets a kind it
 * can't open). */
export async function getSearchSuggestions(
  rawQuery: string | null | undefined,
  libraryOwnerId?: string | null,
  options: { includeCompanies?: boolean } = {},
): Promise<SearchSuggestion[]> {
  const query = rawQuery?.trim();
  if (!query || query.length < 2) return [];
  const text = searchText(query);

  const networkMatches = options.includeCompanies ? matchNetworks(CURATED_NETWORKS, text) : [];
  const [multi, companyResults, networks] = await Promise.all([
    searchMulti(text).catch(() => null),
    options.includeCompanies ? searchCompany(text).catch(() => null) : null,
    Promise.all(
      networkMatches.slice(0, SUGGESTION_LIMITS.company).map(async (network) => {
        const details = await getNetworkDetails(network.id).catch(() => null);
        return { kind: "network" as const, id: network.id, name: details?.name ?? network.name, logoPath: details?.logo_path ?? null };
      }),
    ),
  ]);
  if (!multi) return [];

  const studios = dedupeCompanies(companyResults?.results ?? []).map((c) => ({
    kind: "company" as const,
    id: c.tmdbId,
    name: c.name,
    logoPath: c.logoPath,
  }));
  const suggestions = groupSuggestions(query, multi.results, [...networks, ...studios]);

  const titles = suggestions.flatMap((s) =>
    s.mediaType === "movie" || s.mediaType === "tv" ? [{ mediaType: s.mediaType, tmdbId: s.id }] : [],
  );
  if (!libraryOwnerId || titles.length === 0) return suggestions;

  // A status lookup failure shouldn't cost the viewer their suggestions —
  // the pills just stay neutral.
  const statusMap = await getLibraryStatusMap(libraryOwnerId, titles).catch(() => null);
  if (!statusMap) return suggestions;

  return suggestions.map((s) =>
    s.mediaType === "movie" || s.mediaType === "tv"
      ? { ...s, status: statusMap.get(`${s.mediaType}:${s.id}`) ?? "untracked" }
      : s,
  );
}

/** `?include=company,network` (either word, or "all") on the API's suggest. */
export function wantsCompanies(include: string | null | undefined): boolean {
  if (!include) return false;
  return include
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .some((part) => part === "company" || part === "companies" || part === "network" || part === "networks" || part === "all");
}
