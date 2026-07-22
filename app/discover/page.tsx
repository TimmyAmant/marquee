import { PosterCard } from "@/components/poster-card";
import { StatusBadge } from "@/components/status-badge";
import { PosterRowItem } from "@/components/poster-row";
import { Shelf } from "@/components/shelf";
import { GenreCard, genreColorClass } from "@/components/genre-card";
import { LogoCard } from "@/components/logo-card";
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
  type TmdbGenre,
} from "@/lib/tmdb/client";
import { CURATED_STUDIO_IDS, CURATED_NETWORK_IDS } from "@/lib/tmdb/curated-companies";
import { getLibraryStatusMap, getRecentlyAdded } from "@/lib/library/query";
import { getViewerContext } from "@/lib/integrations/library-owner";
import type { MediaType } from "@/lib/db/schema";

async function fetchMovieGenreBackdrops(genres: TmdbGenre[]) {
  return Promise.all(
    genres.map((g) =>
      discoverMovies({ genreId: g.id, sort: "popularity", page: 1 })
        .then((r) => r.results[0]?.backdrop_path ?? null)
        .catch(() => null),
    ),
  );
}

async function fetchTvGenreBackdrops(genres: TmdbGenre[]) {
  return Promise.all(
    genres.map((g) =>
      discoverTv({ genreId: g.id, sort: "popularity", page: 1 })
        .then((r) => r.results[0]?.backdrop_path ?? null)
        .catch(() => null),
    ),
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

  const movieGenreList = movieGenres.genres.slice(0, 12);
  const tvGenreList = tvGenres.genres.slice(0, 12);
  const [movieGenreBackdrops, tvGenreBackdropList] = await Promise.all([
    fetchMovieGenreBackdrops(movieGenreList),
    fetchTvGenreBackdrops(tvGenreList),
  ]);

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
          <Shelf title="Recently Added">
            {recentlyAdded.map((item) => (
              <PosterRowItem key={item.titleId}>
                <PosterCard
                  href={`/title/${item.mediaType}/${item.tmdbId}`}
                  posterPath={item.posterPath}
                  name={item.name}
                  year={item.year}
                  typeLabel={item.mediaType === "movie" ? "MOVIE" : "SERIES"}
                  badge={item.status && <StatusBadge status={item.status} compact />}
                  status={item.status}
                />
              </PosterRowItem>
            ))}
          </Shelf>
        )}

        {trendingItems.length > 0 && (
          <Shelf title="Trending">
            {trendingItems.map((item) => {
              const status = statusMap.get(`${item.media_type}:${item.id}`);
              return (
                <PosterRowItem key={`${item.media_type}-${item.id}`}>
                  <PosterCard
                    href={`/title/${item.media_type}/${item.id}`}
                    posterPath={item.poster_path}
                    name={item.title || item.name || ""}
                    year={(item.release_date || item.first_air_date || "").slice(0, 4)}
                    typeLabel={item.media_type === "movie" ? "MOVIE" : "SERIES"}
                    badge={status && <StatusBadge status={status} compact />}
                    status={status}
                  />
                </PosterRowItem>
              );
            })}
          </Shelf>
        )}

        {popularMovieItems.length > 0 && (
          <Shelf title="Popular Movies" seeAllHref="/movies">
            {popularMovieItems.map((item) => {
              const status = statusMap.get(`movie:${item.id}`);
              return (
                <PosterRowItem key={item.id}>
                  <PosterCard
                    href={`/title/movie/${item.id}`}
                    posterPath={item.poster_path}
                    name={item.title || ""}
                    year={item.release_date?.slice(0, 4)}
                    typeLabel="MOVIE"
                    badge={status && <StatusBadge status={status} compact />}
                    status={status}
                  />
                </PosterRowItem>
              );
            })}
          </Shelf>
        )}

        {movieGenreList.length > 0 && (
          <Shelf title="Movie Genres" seeAllHref="/movies">
            {movieGenreList.map((genre, i) => (
              <GenreCard
                key={genre.id}
                name={genre.name}
                href={`/movies?genre=${genre.id}`}
                backdropPath={movieGenreBackdrops[i]}
                colorClass={genreColorClass(genre.id, i)}
              />
            ))}
          </Shelf>
        )}

        {upcomingMovieItems.length > 0 && (
          <Shelf title="Upcoming Movies">
            {upcomingMovieItems.map((item) => {
              const status = statusMap.get(`movie:${item.id}`);
              return (
                <PosterRowItem key={item.id}>
                  <PosterCard
                    href={`/title/movie/${item.id}`}
                    posterPath={item.poster_path}
                    name={item.title}
                    year={item.release_date?.slice(0, 4)}
                    typeLabel="MOVIE"
                    badge={status && <StatusBadge status={status} compact />}
                    status={status}
                  />
                </PosterRowItem>
              );
            })}
          </Shelf>
        )}

        {studioItems.length > 0 && (
          <Shelf title="Studios">
            {studioItems.map((studio) => (
              <LogoCard
                key={studio.id}
                href={`/company/${studio.id}`}
                name={studio.name}
                logoPath={studio.logo_path}
              />
            ))}
          </Shelf>
        )}

        {popularSeriesItems.length > 0 && (
          <Shelf title="Popular Series" seeAllHref="/series">
            {popularSeriesItems.map((item) => {
              const status = statusMap.get(`tv:${item.id}`);
              return (
                <PosterRowItem key={item.id}>
                  <PosterCard
                    href={`/title/tv/${item.id}`}
                    posterPath={item.poster_path}
                    name={item.name || ""}
                    year={item.first_air_date?.slice(0, 4)}
                    typeLabel="SERIES"
                    badge={status && <StatusBadge status={status} compact />}
                    status={status}
                  />
                </PosterRowItem>
              );
            })}
          </Shelf>
        )}

        {tvGenreList.length > 0 && (
          <Shelf title="Series Genres" seeAllHref="/series">
            {tvGenreList.map((genre, i) => (
              <GenreCard
                key={genre.id}
                name={genre.name}
                href={`/series?genre=${genre.id}`}
                backdropPath={tvGenreBackdropList[i]}
                colorClass={genreColorClass(genre.id, i)}
              />
            ))}
          </Shelf>
        )}

        {upcomingSeriesItems.length > 0 && (
          <Shelf title="Upcoming Series">
            {upcomingSeriesItems.map((item) => {
              const status = statusMap.get(`tv:${item.id}`);
              return (
                <PosterRowItem key={item.id}>
                  <PosterCard
                    href={`/title/tv/${item.id}`}
                    posterPath={item.poster_path}
                    name={item.name || ""}
                    year={item.first_air_date?.slice(0, 4)}
                    typeLabel="SERIES"
                    badge={status && <StatusBadge status={status} compact />}
                    status={status}
                  />
                </PosterRowItem>
              );
            })}
          </Shelf>
        )}

        {networkItems.length > 0 && (
          <Shelf title="Networks">
            {networkItems.map((network) => (
              <LogoCard
                key={network.id}
                href={`/series?network=${network.id}`}
                name={network.name}
                logoPath={network.logo_path}
              />
            ))}
          </Shelf>
        )}
      </div>
    </div>
  );
}
