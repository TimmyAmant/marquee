import { PosterCard } from "@/components/poster-card";
import { StatusBadge, type LibraryStatus } from "@/components/status-badge";
import { StatusLegend } from "@/components/status-legend";
import { PosterRowItem } from "@/components/poster-row";
import { Shelf } from "@/components/shelf";
import { GenreCard, genreColorClass } from "@/components/genre-card";
import { LogoCard } from "@/components/logo-card";
import { getViewerContext } from "@/lib/integrations/library-owner";
import { loadDiscoverShelves } from "@/lib/pages/discover";
import { DISCOVER_SEE_ALL, seeAllHref, type DiscoverShelfKey } from "@/lib/discover/lists";
import { isBuiltInShelf } from "@/lib/discover/shelves";
import type { MediaType } from "@/lib/db/schema";
import { getT } from "@/lib/i18n/server";
import { DiscoverEditMode } from "@/components/discover-edit-mode";
import { getDiscoverLayout } from "@/lib/discover/layout";

type PosterItem = {
  key: string;
  mediaType: MediaType;
  tmdbId: number;
  name: string;
  posterPath: string | null;
  year: string | null | undefined;
  status: LibraryStatus | undefined;
};

/** One row as the page draws it: posters, genre tiles or logos. */
type Row =
  | { id: string; title: string; seeAll: string; kind: "posters"; items: PosterItem[] }
  | { id: string; title: string; seeAll: string; kind: "genres"; mediaType: MediaType; items: { id: number; name: string; backdropPath: string | null }[] }
  | { id: string; title: string; seeAll: string; kind: "logos"; items: { id: number; name: string; logoPath: string | null; href: string }[] };

export default async function DiscoverPage() {
  const viewer = await getViewerContext();
  const t = await getT();

  // Shared with GET /api/v1/discover: the rows in the admin's order
  // (Settings → Discover), hidden ones left out.
  const data = await loadDiscoverShelves(viewer);
  const status = (mediaType: MediaType, tmdbId: number) => data.statusMap.get(`${mediaType}:${tmdbId}`);

  function builtInRow(key: DiscoverShelfKey, title: string): Row {
    const seeAll = seeAllHref(DISCOVER_SEE_ALL[key]);
    const posters = (items: PosterItem[]): Row => ({ id: key, title, seeAll, kind: "posters", items });
    switch (key) {
      case "recentlyAdded":
        return posters(
          data.recentlyAdded.map((item) => ({
            key: item.titleId,
            mediaType: item.mediaType,
            tmdbId: item.tmdbId,
            name: item.name,
            posterPath: item.posterPath,
            year: item.year,
            status: item.status ?? undefined,
          })),
        );
      case "watchlist":
        return posters(
          data.watchlist.map((item) => ({
            key: `${item.mediaType}-${item.tmdbId}`,
            mediaType: item.mediaType,
            tmdbId: item.tmdbId,
            name: item.name,
            posterPath: item.posterPath,
            year: item.year,
            status: item.status,
          })),
        );
      case "trending":
        return posters(
          data.trendingItems.map((item) => ({
            key: `${item.media_type}-${item.id}`,
            mediaType: item.media_type as MediaType,
            tmdbId: item.id,
            name: item.title || item.name || "",
            posterPath: item.poster_path,
            year: (item.release_date || item.first_air_date || "").slice(0, 4),
            status: status(item.media_type as MediaType, item.id),
          })),
        );
      case "popularMovies":
      case "upcomingMovies":
        return posters(
          (key === "popularMovies" ? data.popularMovieItems : data.upcomingMovieItems).map((item) => ({
            key: String(item.id),
            mediaType: "movie",
            tmdbId: item.id,
            name: item.title || "",
            posterPath: item.poster_path,
            year: item.release_date?.slice(0, 4),
            status: status("movie", item.id),
          })),
        );
      case "popularSeries":
      case "upcomingSeries":
        return posters(
          (key === "popularSeries" ? data.popularSeriesItems : data.upcomingSeriesItems).map((item) => ({
            key: String(item.id),
            mediaType: "tv",
            tmdbId: item.id,
            name: item.name || "",
            posterPath: item.poster_path,
            year: item.first_air_date?.slice(0, 4),
            status: status("tv", item.id),
          })),
        );
      case "movieGenres":
      case "seriesGenres": {
        const movie = key === "movieGenres";
        const list = movie ? data.movieGenreList : data.tvGenreList;
        const backdrops = movie ? data.movieGenreBackdrops : data.tvGenreBackdropList;
        return {
          id: key,
          title,
          seeAll,
          kind: "genres",
          mediaType: movie ? "movie" : "tv",
          items: list.map((genre, i) => ({ id: genre.id, name: genre.name, backdropPath: backdrops[i] ?? null })),
        };
      }
      case "studios":
        return {
          id: key,
          title,
          seeAll,
          kind: "logos",
          items: data.studioItems.map((studio) => ({
            id: studio.id,
            name: studio.name,
            logoPath: studio.logo_path,
            href: `/company/${studio.id}`,
          })),
        };
      case "networks":
        return {
          id: key,
          title,
          seeAll,
          kind: "logos",
          items: data.networkItems.map((network) => ({
            id: network.id,
            name: network.name,
            logoPath: network.logo_path,
            href: `/series?network=${network.id}`,
          })),
        };
    }
  }

  const rows: Row[] = data.layout
    .map((shelf): Row => {
      if (!shelf.custom && isBuiltInShelf(shelf.id)) return builtInRow(shelf.id, shelf.title);
      return {
        id: shelf.id,
        title: shelf.title,
        seeAll: `/discover/${shelf.id}`,
        kind: "posters",
        items: (data.customItems.get(shelf.id) ?? []).map((item) => ({
          key: `${item.mediaType}-${item.tmdbId}`,
          mediaType: item.mediaType,
          tmdbId: item.tmdbId,
          name: item.name,
          posterPath: item.posterPath,
          year: item.year,
          status: item.status ?? status(item.mediaType, item.tmdbId),
        })),
      };
    })
    .filter((row) => row.items.length > 0);

  // The color key sits beside the first poster shelf's header, for anyone
  // signed in (only they see status colors).
  const colorKeyRow = viewer.session ? rows.find((row) => row.kind === "posters")?.id : undefined;
  // The admin's inline edit mode works on every row, hidden ones too.
  const editable = Boolean(viewer.session && viewer.isAdmin);
  const allShelves = editable
    ? (await getDiscoverLayout()).map(({ id, title, hidden }) => ({ id, title, hidden }))
    : [];

  return (
    // Reaches back under the nav rail's 72px margin (.rail-bleed) (and pads the shelves
    // back out of it) so the glow runs to the window edge, like a title's
    // backdrop, instead of stopping in a visible seam.
    <div className="rail-bleed relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 -z-10 h-96"
        style={{
          background:
            "radial-gradient(120% 60% at 50% -10%, rgba(224,166,62,0.14) 0%, rgba(10,10,12,0) 60%)",
        }}
      />

      <div className="flex flex-col gap-12 pl-4 pr-0 py-6 sm:pl-7 sm:py-7">
        <DiscoverEditMode
          editable={editable}
          shelves={allShelves}
          rendered={rows.map((row) => ({ id: row.id, node: renderRow(row) }))}
        />
      </div>
    </div>
  );

  function renderRow(row: Row) {
    if (row.kind === "genres") {
      return (
        <Shelf key={row.id} title={row.title} seeAllHref={row.seeAll}>
          {row.items.map((genre, i) => (
            <GenreCard
              key={genre.id}
              name={genre.name}
              href={`/${row.mediaType === "movie" ? "movies" : "series"}?genre=${genre.id}`}
              backdropPath={genre.backdropPath}
              colorClass={genreColorClass(genre.id, i)}
            />
          ))}
        </Shelf>
      );
    }
    if (row.kind === "logos") {
      return (
        <Shelf key={row.id} title={row.title} seeAllHref={row.seeAll}>
          {row.items.map((logo) => (
            <LogoCard key={logo.id} href={logo.href} name={logo.name} logoPath={logo.logoPath} />
          ))}
        </Shelf>
      );
    }
    return (
      <Shelf
        key={row.id}
        title={row.title}
        seeAllHref={row.seeAll}
        headAction={row.id === colorKeyRow ? <StatusLegend /> : undefined}
      >
        {row.items.map((item) => (
          <PosterRowItem key={item.key}>
            <PosterCard
              href={`/title/${item.mediaType}/${item.tmdbId}`}
              posterPath={item.posterPath}
              name={item.name}
              year={item.year ?? undefined}
              typeLabel={{
                mediaType: item.mediaType,
                text: item.mediaType === "movie" ? t("common.movie") : t("common.series"),
              }}
              badge={item.status && <StatusBadge status={item.status} compact />}
              status={item.status}
            />
          </PosterRowItem>
        ))}
      </Shelf>
    );
  }
}
