import { PosterCard } from "@/components/poster-card";
import { StatusBadge } from "@/components/status-badge";
import { PosterRowItem } from "@/components/poster-row";
import { Shelf } from "@/components/shelf";
import { GenreCard, genreColorClass } from "@/components/genre-card";
import { LogoCard } from "@/components/logo-card";
import { getViewerContext } from "@/lib/integrations/library-owner";
import { loadDiscoverShelves } from "@/lib/pages/discover";

export default async function DiscoverPage() {
  const viewer = await getViewerContext();

  // Shared with GET /api/v1/discover.
  const {
    recentlyAdded,
    trendingItems,
    popularMovieItems,
    upcomingMovieItems,
    popularSeriesItems,
    upcomingSeriesItems,
    movieGenreList,
    movieGenreBackdrops,
    tvGenreList,
    tvGenreBackdropList,
    studioItems,
    networkItems,
    statusMap,
  } = await loadDiscoverShelves(viewer);

  return (
    // Reaches back under the nav rail's 72px margin (and pads the shelves
    // back out of it) so the glow runs to the window edge, like a title's
    // backdrop, instead of stopping in a visible seam.
    <div className="relative overflow-hidden md:-ml-[72px] md:pl-[72px]">
      <div
        className="pointer-events-none absolute inset-0 -z-10 h-96"
        style={{
          background:
            "radial-gradient(120% 60% at 50% -10%, rgba(224,166,62,0.14) 0%, rgba(10,10,12,0) 60%)",
        }}
      />

      <div className="flex flex-col gap-12 pl-4 pr-0 py-6 sm:pl-7 sm:py-7">
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
