import Link from "next/link";
import { auth } from "@/auth";
import { PosterGrid, trimToFullRow } from "@/components/poster-grid";
import { PosterCard } from "@/components/poster-card";
import { PosterRow, PosterRowItem } from "@/components/poster-row";
import { StatusBadge } from "@/components/status-badge";
import { YearSelect } from "@/components/year-select";
import { QuickAddButton } from "@/components/quick-add-button";
import {
  getMovieGenres,
  getTvGenres,
  discoverMovies,
  discoverTv,
  type DiscoverSort,
  type TmdbDiscoverResult,
  type TmdbMovieDetails,
  type TmdbTvDetails,
} from "@/lib/tmdb/client";
import { getLibraryStatusMap } from "@/lib/library/query";
import { getArrCredential, isArrFullyConfigured } from "@/lib/integrations/credentials";
import { getFavoritedTmdbIds } from "@/lib/favorites/query";
import { FavoriteButton } from "@/components/favorite-button";
import { getRecentlyWatched } from "@/lib/plex/sync";
import { getOrFetchTitle } from "@/lib/tmdb/cache";
import { getLibraryOwnerUserId } from "@/lib/integrations/library-owner";
import type { MediaType } from "@/lib/db/schema";

type DiscoverSearchParams = {
  type?: string;
  genre?: string;
  sort?: string;
  page?: string;
  year?: string;
  hideOwned?: string;
};

type DisplayType = "movie" | "tv" | "all";

const SORT_LABELS: Record<DiscoverSort, string> = {
  popularity: "Popular",
  top_rated: "Top rated",
  newest: "Newest",
};

function buildHref(current: DiscoverSearchParams, overrides: Partial<DiscoverSearchParams>) {
  const merged = { ...current, ...overrides };
  const params = new URLSearchParams();
  if (merged.type) params.set("type", merged.type);
  if (merged.genre) params.set("genre", merged.genre);
  if (merged.sort) params.set("sort", merged.sort);
  if (merged.page && merged.page !== "1") params.set("page", merged.page);
  if (merged.year) params.set("year", merged.year);
  if (merged.hideOwned) params.set("hideOwned", merged.hideOwned);
  const qs = params.toString();
  return `/discover${qs ? `?${qs}` : ""}`;
}

// A plain, non-component helper — kept outside the page's render body since
// the React compiler's purity check flags Date.now() called directly inside
// a Server Component, even though this route is already fully dynamic
// (auth() + searchParams), specifically to prevent the value depending on
// unstable render timing.
function getDayIndex(): number {
  return Math.floor(Date.now() / 86_400_000);
}

function toDisplayItem(item: TmdbDiscoverResult, mediaType: MediaType) {
  return {
    tmdbId: item.id,
    mediaType,
    name: item.title || item.name || "",
    posterPath: item.poster_path,
    year: (item.release_date || item.first_air_date || "").slice(0, 4) || null,
    releaseDate: item.release_date || item.first_air_date || "",
    overview: item.overview || null,
    rating: item.vote_average ?? null,
    popularity: item.popularity ?? 0,
    genreId: item.genre_ids?.[0] ?? null,
  };
}

/** "Both" mode merges separate movie and TV result lists, which need to be
 * re-interleaved by whichever sort the user actually picked — matching the
 * `sort_by` already sent to TMDb for each individual list. */
function compareBySort(
  a: ReturnType<typeof toDisplayItem>,
  b: ReturnType<typeof toDisplayItem>,
  sort: DiscoverSort,
): number {
  if (sort === "top_rated") return (b.rating ?? 0) - (a.rating ?? 0);
  if (sort === "newest") return b.releaseDate.localeCompare(a.releaseDate);
  return b.popularity - a.popularity;
}

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<DiscoverSearchParams>;
}) {
  const sp = await searchParams;
  const session = await auth();

  const displayType: DisplayType =
    sp.type === "tv" ? "tv" : sp.type === "all" ? "all" : "movie";
  const sort: DiscoverSort =
    sp.sort === "top_rated" ? "top_rated" : sp.sort === "newest" ? "newest" : "popularity";
  const genreId = sp.genre ? Number(sp.genre) : undefined;
  const page = Math.max(1, Number(sp.page) || 1);
  const year = sp.year ? Number(sp.year) : undefined;
  const hideOwned = Boolean(session?.user) && sp.hideOwned !== "0";

  const [movieGenres, tvGenres] = await Promise.all([
    getMovieGenres().catch(() => ({ genres: [] })),
    getTvGenres().catch(() => ({ genres: [] })),
  ]);
  const movieGenreMap = new Map(movieGenres.genres.map((g) => [g.id, g.name]));
  const tvGenreMap = new Map(tvGenres.genres.map((g) => [g.id, g.name]));
  const genresForFilter = displayType === "tv" ? tvGenres.genres : movieGenres.genres;

  // Fetch several underlying TMDb pages per screen, not just one. When "hide
  // titles you already track" removes a lot of matches (as it will for an
  // account with a large synced library), filtering a single 20-item page
  // can leave the grid nearly empty no matter which page you're on.
  const BATCH_SIZE = 3;
  const startTmdbPage = (page - 1) * BATCH_SIZE + 1;
  const tmdbPages = Array.from({ length: BATCH_SIZE }, (_, i) => startTmdbPage + i);
  const emptyResponse = { results: [], total_pages: 1, total_results: 0 };

  let rawItems: ReturnType<typeof toDisplayItem>[];
  let hasNextPage: boolean;

  if (displayType === "all") {
    const [movieResponses, tvResponses] = await Promise.all([
      Promise.all(
        tmdbPages.map((p) => discoverMovies({ sort, page: p, year }).catch(() => emptyResponse)),
      ),
      Promise.all(
        tmdbPages.map((p) => discoverTv({ sort, page: p, year }).catch(() => emptyResponse)),
      ),
    ]);

    rawItems = [
      ...movieResponses.flatMap((r) => r.results).map((i) => toDisplayItem(i, "movie")),
      ...tvResponses.flatMap((r) => r.results).map((i) => toDisplayItem(i, "tv")),
    ].sort((a, b) => compareBySort(a, b, sort));

    const maxTotalPages = Math.max(...movieResponses.map((r) => r.total_pages), ...tvResponses.map((r) => r.total_pages));
    hasNextPage = tmdbPages[tmdbPages.length - 1] < Math.min(maxTotalPages, 500);
  } else {
    const responses = await Promise.all(
      tmdbPages.map((p) =>
        (displayType === "movie"
          ? discoverMovies({ genreId, sort, page: p, year })
          : discoverTv({ genreId, sort, page: p, year })
        ).catch(() => emptyResponse),
      ),
    );

    rawItems = responses.flatMap((r) => r.results).map((i) => toDisplayItem(i, displayType));
    const maxTotalPages = Math.max(...responses.map((r) => r.total_pages));
    hasNextPage = tmdbPages[tmdbPages.length - 1] < Math.min(maxTotalPages, 500);
  }

  // Members share the admin's connected Plex/Sonarr/Radarr rather than
  // having their own — resolve to whichever account actually owns the
  // synced data before reading it. Computed once here so both the watch
  // history below and the status/credential lookups further down use the
  // same resolution.
  const libraryOwnerId = session?.user ? await getLibraryOwnerUserId(session.user.id) : null;

  // "Because you watched" — rotates daily through your last several
  // watched titles (rather than always the single most recent one) so the
  // row doesn't look identical on every visit, using TMDb's own
  // recommendations for whichever title comes up (already cached in
  // `titles.rawTmdb` from whenever that title's page/sync last fetched it,
  // so this is usually a free read rather than a fresh TMDb call).
  let becauseYouWatched: { title: string; items: ReturnType<typeof toDisplayItem>[] } | null = null;
  if (libraryOwnerId && page === 1 && !genreId && !year) {
    const recentList = await getRecentlyWatched(libraryOwnerId, 10).catch(() => []);
    const recent =
      recentList.length > 0 ? recentList[getDayIndex() % recentList.length] : undefined;
    if (recent) {
      const watchedTitle = await getOrFetchTitle(recent.mediaType, recent.tmdbId).catch(() => null);
      const raw = watchedTitle?.rawTmdb as (TmdbMovieDetails | TmdbTvDetails) | null;
      const recs = raw?.recommendations?.results ?? [];
      if (watchedTitle && recs.length > 0) {
        becauseYouWatched = {
          title: watchedTitle.name,
          items: recs
            .slice(0, 12)
            .map((r) =>
              toDisplayItem(
                {
                  id: r.id,
                  title: r.title,
                  name: r.name,
                  poster_path: r.poster_path,
                  backdrop_path: null,
                  release_date: r.release_date,
                  first_air_date: r.first_air_date,
                  overview: "",
                  vote_average: 0,
                  popularity: 0,
                },
                recent.mediaType,
              ),
            ),
        };
      }
    }
  }

  // Combine the main grid and the "Because you watched" row for the shared
  // status/favorite lookups below, so each only needs one query instead of
  // two — otherwise the row's cards would silently render with no
  // status badge, favorite star, or quick-add button at all.
  const allDisplayedItems = becauseYouWatched ? [...rawItems, ...becauseYouWatched.items] : rawItems;

  const statusMap = libraryOwnerId
    ? await getLibraryStatusMap(
        libraryOwnerId,
        allDisplayedItems.map((i) => ({ mediaType: i.mediaType, tmdbId: i.tmdbId })),
      )
    : new Map();

  // "Hide titles you already track" shrinks a fixed-size batch by a
  // different, unpredictable amount every time, so the surviving count is
  // rarely a clean multiple of the grid's column count — trim the trailing
  // partial row rather than showing it ragged. Nothing is actually lost:
  // the same titles still turn up on the next page.
  const items = trimToFullRow(
    hideOwned ? rawItems.filter((i) => !statusMap.has(`${i.mediaType}:${i.tmdbId}`)) : rawItems,
  );

  const [radarrCredential, sonarrCredential, favoritedMovieIds, favoritedTvIds] = session?.user
    ? await Promise.all([
        getArrCredential(session.user.id, "radarr"),
        getArrCredential(session.user.id, "sonarr"),
        getFavoritedTmdbIds(
          session.user.id,
          "movie",
          allDisplayedItems.filter((i) => i.mediaType === "movie").map((i) => i.tmdbId),
        ),
        getFavoritedTmdbIds(
          session.user.id,
          "tv",
          allDisplayedItems.filter((i) => i.mediaType === "tv").map((i) => i.tmdbId),
        ),
      ])
    : [null, null, new Set<number>(), new Set<number>()];

  const arrConfigured = {
    movie: isArrFullyConfigured(radarrCredential),
    tv: isArrFullyConfigured(sonarrCredential),
  };

  return (
    <div className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 -z-10 h-96"
        style={{
          background:
            "radial-gradient(120% 60% at 50% -10%, rgba(224,166,62,0.14) 0%, rgba(10,10,12,0) 60%)",
        }}
      />

      <div className="mx-auto max-w-6xl px-6 py-12">
        <h1 className="font-display text-3xl text-text-primary">Discover</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Browse by genre, year, and popularity to find something new to add.
        </p>

        {becauseYouWatched && (
          <section className="mt-8">
            <h2 className="mb-4 font-display text-xl text-text-primary">
              Because you watched {becauseYouWatched.title}
            </h2>
            <PosterRow>
              {becauseYouWatched.items.map((item) => {
                const status = statusMap.get(`${item.mediaType}:${item.tmdbId}`);
                const canQuickAdd = Boolean(session?.user) && arrConfigured[item.mediaType] && !status;
                return (
                  <PosterRowItem key={`${item.mediaType}-${item.tmdbId}`}>
                    <PosterCard
                      href={`/title/${item.mediaType}/${item.tmdbId}`}
                      posterPath={item.posterPath}
                      name={item.name}
                      year={item.year}
                      badge={status && <StatusBadge status={status} compact />}
                      favoriteAction={
                        session?.user && (
                          <FavoriteButton
                            entityType={item.mediaType}
                            tmdbId={item.tmdbId}
                            initialFavorited={
                              item.mediaType === "movie"
                                ? favoritedMovieIds.has(item.tmdbId)
                                : favoritedTvIds.has(item.tmdbId)
                            }
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
                  </PosterRowItem>
                );
              })}
            </PosterRow>
          </section>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <div className="flex gap-1 rounded-full border border-border p-1 text-xs">
            {(["movie", "tv", "all"] as const).map((t) => (
              <Link
                key={t}
                href={buildHref(sp, { type: t, genre: undefined, page: undefined })}
                className={`rounded-full px-3 py-1 transition-colors ${
                  displayType === t
                    ? "bg-accent text-bg-0"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                {t === "movie" ? "Movies" : t === "tv" ? "TV" : "Both"}
              </Link>
            ))}
          </div>

          <div className="flex gap-1 rounded-full border border-border p-1 text-xs">
            {(Object.keys(SORT_LABELS) as DiscoverSort[]).map((s) => (
              <Link
                key={s}
                href={buildHref(sp, { sort: s, page: undefined })}
                className={`rounded-full px-3 py-1 transition-colors ${
                  sort === s ? "bg-accent text-bg-0" : "text-text-secondary hover:text-text-primary"
                }`}
              >
                {SORT_LABELS[s]}
              </Link>
            ))}
          </div>

          <YearSelect currentYear={sp.year} currentParams={sp} />

          {session?.user && (
            <Link
              href={buildHref(sp, { hideOwned: hideOwned ? "0" : "1", page: undefined })}
              className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                hideOwned
                  ? "border-accent text-accent"
                  : "border-border text-text-secondary hover:text-text-primary"
              }`}
            >
              {hideOwned ? "✓ Hiding titles you already track" : "Hide titles you already track"}
            </Link>
          )}
        </div>

        {displayType !== "all" && genresForFilter.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={buildHref(sp, { genre: undefined, page: undefined })}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                !genreId
                  ? "border-accent text-accent"
                  : "border-border text-text-secondary hover:text-text-primary"
              }`}
            >
              All genres
            </Link>
            {genresForFilter.map((genre) => (
              <Link
                key={genre.id}
                href={buildHref(sp, { genre: String(genre.id), page: undefined })}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  genreId === genre.id
                    ? "border-accent text-accent"
                    : "border-border text-text-secondary hover:text-text-primary"
                }`}
              >
                {genre.name}
              </Link>
            ))}
          </div>
        )}

        <div className="mt-8">
          {items.length === 0 ? (
            <p className="text-sm text-text-muted">
              Nothing left here — try a different genre or year, or turn off &ldquo;Hide titles you
              already track&rdquo;.
            </p>
          ) : (
            <PosterGrid>
              {items.map((item) => {
                const status = statusMap.get(`${item.mediaType}:${item.tmdbId}`);
                const genreMap = item.mediaType === "movie" ? movieGenreMap : tvGenreMap;
                const genreName = item.genreId ? genreMap.get(item.genreId) : undefined;
                const canQuickAdd = Boolean(session?.user) && arrConfigured[item.mediaType] && !status;

                return (
                  <PosterCard
                    key={`${item.mediaType}-${item.tmdbId}`}
                    href={`/title/${item.mediaType}/${item.tmdbId}`}
                    posterPath={item.posterPath}
                    name={item.name}
                    year={item.year}
                    meta={genreName}
                    rating={item.rating}
                    overview={item.overview}
                    badge={status && <StatusBadge status={status} compact />}
                    favoriteAction={
                      session?.user && (
                        <FavoriteButton
                          entityType={item.mediaType}
                          tmdbId={item.tmdbId}
                          initialFavorited={
                            item.mediaType === "movie"
                              ? favoritedMovieIds.has(item.tmdbId)
                              : favoritedTvIds.has(item.tmdbId)
                          }
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
          )}
        </div>

        <div className="mt-10 flex items-center justify-center gap-3">
          {page > 1 && (
            <Link
              href={buildHref(sp, { page: String(page - 1) })}
              className="rounded-full border border-border-strong px-4 py-2 text-sm text-text-primary transition-colors hover:border-accent hover:text-accent"
            >
              Previous
            </Link>
          )}
          <span className="text-sm text-text-muted">Page {page}</span>
          {hasNextPage && (
            <Link
              href={buildHref(sp, { page: String(page + 1) })}
              className="rounded-full border border-border-strong px-4 py-2 text-sm text-text-primary transition-colors hover:border-accent hover:text-accent"
            >
              Next
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
