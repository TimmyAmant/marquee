import Link from "next/link";
import { PosterCard } from "@/components/poster-card";
import { StatusBadge } from "@/components/status-badge";
import { PosterRow, PosterRowItem } from "@/components/poster-row";
import { StudioChip } from "@/components/studio-chip";
import { GenreRow } from "@/components/genre-row";
import {
  getTrendingAll,
  getUpcomingMovies,
  getUpcomingTv,
  discoverMovies,
  discoverTv,
  getMovieGenres,
  getTvGenres,
  getCompanyDetails,
  getNetworkDetails,
} from "@/lib/tmdb/client";
import { CURATED_STUDIO_IDS, CURATED_NETWORK_IDS } from "@/lib/tmdb/curated-companies";
import { getLibraryStatusMap, getRecentlyAdded } from "@/lib/library/query";
import { getViewerContext } from "@/lib/integrations/library-owner";
import type { MediaType } from "@/lib/db/schema";

/** A row title paired with a "See all" link to the fuller browse page —
 * Popular/Genres rows point at /movies or /series, Trending/Upcoming/Recently
 * Added rows have no equivalent full listing so they render without one. */
function RowHeading({ title, href }: { title: string; href?: string }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <h2 className="font-display text-xl text-text-primary">{title}</h2>
      {href && (
        <Link href={href} className="text-sm text-text-secondary transition-colors hover:text-accent">
          See all
        </Link>
      )}
    </div>
  );
}

export default async function DiscoverPage() {
  const viewer = await getViewerContext();

  const [
    recentlyAdded,
    trending,
    popularMovies,
    upcomingMovies,
    popularSeries,
    upcomingSeries,
    movieGenres,
    tvGenres,
    studios,
    networks,
  ] = await Promise.all([
    viewer.libraryOwnerId ? getRecentlyAdded(viewer.libraryOwnerId, 20) : Promise.resolve([]),
    getTrendingAll().catch(() => ({ results: [] })),
    discoverMovies({ sort: "popularity", page: 1 }).catch(() => ({ results: [] })),
    getUpcomingMovies().catch(() => ({ results: [] })),
    discoverTv({ sort: "popularity", page: 1 }).catch(() => ({ results: [] })),
    getUpcomingTv().catch(() => ({ results: [] })),
    getMovieGenres().catch(() => ({ genres: [] })),
    getTvGenres().catch(() => ({ genres: [] })),
    Promise.all(CURATED_STUDIO_IDS.map((id) => getCompanyDetails(id).catch(() => null))),
    Promise.all(CURATED_NETWORK_IDS.map((id) => getNetworkDetails(id).catch(() => null))),
  ]);

  const trendingItems = trending.results
    .filter((item) => item.media_type === "movie" || item.media_type === "tv")
    .slice(0, 20);
  const popularMovieItems = popularMovies.results.slice(0, 20);
  const popularSeriesItems = popularSeries.results.slice(0, 20);

  // TMDb's /movie/upcoming endpoint is really "currently in theaters or
  // about to be" for the given region, not strictly "release date is in the
  // future" — it can include already-released classics that got a limited
  // anniversary re-release. Filter to titles whose actual release date
  // hasn't happened yet.
  const todayStr = new Date().toISOString().slice(0, 10);
  const upcomingMovieItems = upcomingMovies.results
    .filter((item) => item.release_date && item.release_date >= todayStr)
    .slice(0, 20);
  const upcomingSeriesItems = upcomingSeries.results.slice(0, 20);

  const statusMap = viewer.libraryOwnerId
    ? await getLibraryStatusMap(viewer.libraryOwnerId, [
        ...trendingItems.map((i) => ({ mediaType: i.media_type as MediaType, tmdbId: i.id })),
        ...popularMovieItems.map((i) => ({ mediaType: "movie" as MediaType, tmdbId: i.id })),
        ...upcomingMovieItems.map((i) => ({ mediaType: "movie" as MediaType, tmdbId: i.id })),
        ...popularSeriesItems.map((i) => ({ mediaType: "tv" as MediaType, tmdbId: i.id })),
        ...upcomingSeriesItems.map((i) => ({ mediaType: "tv" as MediaType, tmdbId: i.id })),
      ])
    : new Map();

  const studioItems = studios.filter((s): s is NonNullable<typeof s> => s !== null);
  const networkItems = networks.filter((n): n is NonNullable<typeof n> => n !== null);

  return (
    <div className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 -z-10 h-96"
        style={{
          background:
            "radial-gradient(120% 60% at 50% -10%, rgba(224,166,62,0.14) 0%, rgba(10,10,12,0) 60%)",
        }}
      />

      <div className="mx-auto flex max-w-6xl flex-col gap-14 px-6 py-12">
        {recentlyAdded.length > 0 && (
          <section>
            <RowHeading title="Recently Added" />
            <PosterRow>
              {recentlyAdded.map((item) => (
                <PosterRowItem key={item.titleId}>
                  <PosterCard
                    href={`/title/${item.mediaType}/${item.tmdbId}`}
                    posterPath={item.posterPath}
                    name={item.name}
                    year={item.year}
                    badge={item.status && <StatusBadge status={item.status} compact />}
                    status={item.status}
                  />
                </PosterRowItem>
              ))}
            </PosterRow>
          </section>
        )}

        {trendingItems.length > 0 && (
          <section>
            <RowHeading title="Trending" />
            <PosterRow>
              {trendingItems.map((item) => {
                const status = statusMap.get(`${item.media_type}:${item.id}`);
                return (
                  <PosterRowItem key={`${item.media_type}-${item.id}`}>
                    <PosterCard
                      href={`/title/${item.media_type}/${item.id}`}
                      posterPath={item.poster_path}
                      name={item.title || item.name || ""}
                      year={(item.release_date || item.first_air_date || "").slice(0, 4)}
                      badge={status && <StatusBadge status={status} compact />}
                      status={status}
                    />
                  </PosterRowItem>
                );
              })}
            </PosterRow>
          </section>
        )}

        {popularMovieItems.length > 0 && (
          <section>
            <RowHeading title="Popular Movies" href="/movies" />
            <PosterRow>
              {popularMovieItems.map((item) => {
                const status = statusMap.get(`movie:${item.id}`);
                return (
                  <PosterRowItem key={item.id}>
                    <PosterCard
                      href={`/title/movie/${item.id}`}
                      posterPath={item.poster_path}
                      name={item.title || ""}
                      year={item.release_date?.slice(0, 4)}
                      badge={status && <StatusBadge status={status} compact />}
                      status={status}
                    />
                  </PosterRowItem>
                );
              })}
            </PosterRow>
          </section>
        )}

        <GenreRow title="Movie Genres" genres={movieGenres.genres} basePath="/movies" />

        {upcomingMovieItems.length > 0 && (
          <section>
            <RowHeading title="Upcoming Movies" />
            <PosterRow>
              {upcomingMovieItems.map((item) => {
                const status = statusMap.get(`movie:${item.id}`);
                return (
                  <PosterRowItem key={item.id}>
                    <PosterCard
                      href={`/title/movie/${item.id}`}
                      posterPath={item.poster_path}
                      name={item.title}
                      year={item.release_date?.slice(0, 4)}
                      badge={status && <StatusBadge status={status} compact />}
                      status={status}
                    />
                  </PosterRowItem>
                );
              })}
            </PosterRow>
          </section>
        )}

        {studioItems.length > 0 && (
          <section>
            <RowHeading title="Studios" />
            <div className="flex flex-wrap gap-3">
              {studioItems.map((studio) => (
                <StudioChip key={studio.id} tmdbId={studio.id} name={studio.name} logoPath={studio.logo_path} />
              ))}
            </div>
          </section>
        )}

        {popularSeriesItems.length > 0 && (
          <section>
            <RowHeading title="Popular Series" href="/series" />
            <PosterRow>
              {popularSeriesItems.map((item) => {
                const status = statusMap.get(`tv:${item.id}`);
                return (
                  <PosterRowItem key={item.id}>
                    <PosterCard
                      href={`/title/tv/${item.id}`}
                      posterPath={item.poster_path}
                      name={item.name || ""}
                      year={item.first_air_date?.slice(0, 4)}
                      badge={status && <StatusBadge status={status} compact />}
                      status={status}
                    />
                  </PosterRowItem>
                );
              })}
            </PosterRow>
          </section>
        )}

        <GenreRow title="Series Genres" genres={tvGenres.genres} basePath="/series" />

        {upcomingSeriesItems.length > 0 && (
          <section>
            <RowHeading title="Upcoming Series" />
            <PosterRow>
              {upcomingSeriesItems.map((item) => {
                const status = statusMap.get(`tv:${item.id}`);
                return (
                  <PosterRowItem key={item.id}>
                    <PosterCard
                      href={`/title/tv/${item.id}`}
                      posterPath={item.poster_path}
                      name={item.name || ""}
                      year={item.first_air_date?.slice(0, 4)}
                      badge={status && <StatusBadge status={status} compact />}
                      status={status}
                    />
                  </PosterRowItem>
                );
              })}
            </PosterRow>
          </section>
        )}

        {networkItems.length > 0 && (
          <section>
            <RowHeading title="Networks" />
            <div className="flex flex-wrap gap-3">
              {networkItems.map((network) => (
                <StudioChip
                  key={network.id}
                  tmdbId={network.id}
                  name={network.name}
                  logoPath={network.logo_path}
                  href={`/series?network=${network.id}`}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
