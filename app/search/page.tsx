import { SearchBar } from "@/components/search-bar";
import { PosterGrid } from "@/components/poster-grid";
import { PosterCard } from "@/components/poster-card";
import { StatusBadge } from "@/components/status-badge";
import { StudioChip } from "@/components/studio-chip";
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
  type TmdbGenre,
  type TmdbDiscoverResult,
} from "@/lib/tmdb/client";
import { getLibraryStatusMap } from "@/lib/library/query";
import { dedupeCompanies } from "@/lib/tmdb/company-groups";
import { getArrCredential, isArrFullyConfigured } from "@/lib/integrations/credentials";
import { getFavoritedTmdbIds } from "@/lib/favorites/query";
import { FavoriteButton } from "@/components/favorite-button";
import { QuickAddButton } from "@/components/quick-add-button";
import { getViewerContext } from "@/lib/integrations/library-owner";
import type { MediaType } from "@/lib/db/schema";

// Words that describe "what kind of thing to search for" rather than the
// theme itself — stripped before matching against genres/keywords, since
// people naturally type "action movies" or "national disaster movies and tv
// shows" and mean the theme, not those literal words.
const MEDIA_WORDS = /\b(movies?|films?|shows?|series|tv)\b/gi;

function normalizeForThemeMatch(query: string): string {
  return query.replace(MEDIA_WORDS, "").replace(/\s+/g, " ").trim();
}

function findGenreMatch(genres: TmdbGenre[], normalized: string): TmdbGenre | null {
  if (!normalized) return null;
  const lower = normalized.toLowerCase();
  const exact = genres.find((g) => g.name.toLowerCase() === lower);
  if (exact) return exact;

  // Only consider a substring match for short queries — TMDb genre names are
  // at most two words, so anything longer is a real title/phrase that just
  // happens to contain a genre word (e.g. "Crime and Punishment" contains
  // "Crime"), not a genre-browse request.
  if (lower.split(" ").length > 2) return null;
  const partial = genres.find(
    (g) => g.name.toLowerCase().includes(lower) || lower.includes(g.name.toLowerCase()),
  );
  return partial ?? null;
}

function toThemeItem(item: TmdbDiscoverResult, mediaType: MediaType) {
  return {
    tmdbId: item.id,
    mediaType,
    name: item.title || item.name || "",
    posterPath: item.poster_path,
    year: (item.release_date || item.first_air_date || "").slice(0, 4) || null,
  };
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = q?.trim();

  if (!query) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-20 text-center">
        <h1 className="font-display text-3xl text-text-primary">Search Marquee</h1>
        <div className="mt-8">
          <SearchBar />
        </div>
      </div>
    );
  }

  const normalized = normalizeForThemeMatch(query);

  const [multi, companies, movieGenres, tvGenres, viewer] = await Promise.all([
    searchMulti(query).catch(() => null),
    searchCompany(query).catch(() => null),
    getMovieGenres().catch(() => ({ genres: [] })),
    getTvGenres().catch(() => ({ genres: [] })),
    getViewerContext(),
  ]);

  const people = multi?.results.filter((r) => r.media_type === "person") ?? [];
  const titleResults = multi?.results.filter((r) => r.media_type === "movie" || r.media_type === "tv") ?? [];
  const companyResults = dedupeCompanies(companies?.results ?? []);

  const movieGenreMatch = findGenreMatch(movieGenres.genres, normalized);
  const tvGenreMatch = findGenreMatch(tvGenres.genres, normalized);

  let themeLabel: string | null = null;
  let themeItems: ReturnType<typeof toThemeItem>[] = [];

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
    : [new Map(), null, null, new Set<number>(), new Set<number>(), new Set<number>(), new Set<number>()];

  const arrConfigured = {
    movie: isArrFullyConfigured(radarrCredential),
    tv: isArrFullyConfigured(sonarrCredential),
  };
  function favoritedTitle(mediaType: MediaType, tmdbId: number) {
    return mediaType === "movie" ? favoritedMovieIds.has(tmdbId) : favoritedTvIds.has(tmdbId);
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      {!hasResults && (
        <p className="text-center text-text-secondary">
          No results for &ldquo;{query}&rdquo;.
        </p>
      )}

      {people.length > 0 && (
        <section className="mb-12">
          <h2 className="mb-4 font-display text-xl text-text-primary">People</h2>
          <PosterGrid>
            {people.map((person) => (
              <PosterCard
                key={person.id}
                href={`/person/${person.id}`}
                posterPath={person.profile_path ?? null}
                name={person.name ?? ""}
                subtitle={person.known_for_department}
                favoriteAction={
                  viewer.session && (
                    <FavoriteButton
                      entityType="person"
                      tmdbId={person.id}
                      initialFavorited={favoritedPersonIds.has(person.id)}
                      compact
                    />
                  )
                }
              />
            ))}
          </PosterGrid>
        </section>
      )}

      {companyResults.length > 0 && (
        <section className="mb-12">
          <h2 className="mb-4 font-display text-xl text-text-primary">Studios</h2>
          <div className="flex flex-wrap gap-3">
            {companyResults.map((company) => (
              <StudioChip
                key={company.tmdbId}
                tmdbId={company.tmdbId}
                name={company.name}
                logoPath={company.logoPath}
                favoriteAction={
                  viewer.session && (
                    <FavoriteButton
                      entityType="company"
                      tmdbId={company.tmdbId}
                      initialFavorited={favoritedCompanyIds.has(company.tmdbId)}
                      compact
                    />
                  )
                }
              />
            ))}
          </div>
        </section>
      )}

      {titleResults.length > 0 && (
        <section className="mb-12">
          <h2 className="mb-4 font-display text-xl text-text-primary">Titles</h2>
          <PosterGrid>
            {titleResults.map((title) => {
              const mediaType = title.media_type as MediaType;
              const status = statusMap.get(`${mediaType}:${title.id}`);
              const canQuickAdd = Boolean(viewer.session) && arrConfigured[mediaType] && !status;
              return (
                <PosterCard
                  key={`${mediaType}-${title.id}`}
                  href={`/title/${mediaType}/${title.id}`}
                  posterPath={title.poster_path ?? null}
                  name={title.title || title.name || ""}
                  year={(title.release_date || title.first_air_date || "").slice(0, 4)}
                  badge={status && <StatusBadge status={status} compact />}
                  status={status}
                  favoriteAction={
                    viewer.session && (
                      <FavoriteButton
                        entityType={mediaType}
                        tmdbId={title.id}
                        initialFavorited={favoritedTitle(mediaType, title.id)}
                        compact
                      />
                    )
                  }
                  quickAction={
                    canQuickAdd ? <QuickAddButton mediaType={mediaType} tmdbId={title.id} /> : undefined
                  }
                />
              );
            })}
          </PosterGrid>
        </section>
      )}

      {themeItems.length > 0 && (
        <section>
          <h2 className="mb-4 font-display text-xl text-text-primary">
            {`${themeLabel} movies & TV`}
          </h2>
          <PosterGrid>
            {themeItems.map((item) => {
              const status = statusMap.get(`${item.mediaType}:${item.tmdbId}`);
              const canQuickAdd = Boolean(viewer.session) && arrConfigured[item.mediaType] && !status;
              return (
                <PosterCard
                  key={`${item.mediaType}-${item.tmdbId}`}
                  href={`/title/${item.mediaType}/${item.tmdbId}`}
                  posterPath={item.posterPath}
                  name={item.name}
                  year={item.year}
                  badge={status && <StatusBadge status={status} compact />}
                  status={status}
                  favoriteAction={
                    viewer.session && (
                      <FavoriteButton
                        entityType={item.mediaType}
                        tmdbId={item.tmdbId}
                        initialFavorited={favoritedTitle(item.mediaType, item.tmdbId)}
                        compact
                      />
                    )
                  }
                  quickAction={
                    canQuickAdd ? (
                      <QuickAddButton mediaType={item.mediaType} tmdbId={item.tmdbId} />
                    ) : undefined
                  }
                />
              );
            })}
          </PosterGrid>
        </section>
      )}
    </div>
  );
}
