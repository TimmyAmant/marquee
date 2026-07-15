import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { TitleHero } from "@/components/title-hero";
import { CastRow } from "@/components/cast-row";
import { StudioRow } from "@/components/studio-row";
import { SimilarTitlesRow, type SimilarTitle } from "@/components/similar-titles-row";
import { FranchiseRow, type FranchiseItem } from "@/components/franchise-row";
import { SeasonSelector, EpisodeList } from "@/components/season-episode-list";
import { getOrFetchTitle } from "@/lib/tmdb/cache";
import { getTitleLibraryStatus, getSonarrSeasonBreakdown } from "@/lib/integrations/status";
import { getLibraryStatusMap } from "@/lib/library/query";
import { findTrailer, getTvSeasonDetails, getCollection } from "@/lib/tmdb/client";
import { findTvFranchiseGroup } from "@/lib/tmdb/tv-franchise-groups";
import type { MediaType } from "@/lib/db/schema";
import type { TmdbMovieDetails, TmdbTvDetails } from "@/lib/tmdb/client";

export default async function TitlePage({
  params,
  searchParams,
}: {
  params: Promise<{ type: string; id: string }>;
  searchParams: Promise<{ season?: string }>;
}) {
  const { type, id } = await params;
  const { season } = await searchParams;
  const tmdbId = Number(id);
  if ((type !== "movie" && type !== "tv") || !Number.isFinite(tmdbId)) notFound();

  const session = await auth();

  const title = await getOrFetchTitle(type as MediaType, tmdbId).catch(() => undefined);
  if (!title) notFound();

  const year = (title.releaseDate || title.firstAirDate || "").slice(0, 4) || null;

  const libraryStatus = session?.user
    ? await getTitleLibraryStatus(session.user.id, type, tmdbId, title.tvdbId)
    : { status: "untracked" as const, configured: false, file: null };

  const raw = title.rawTmdb as (TmdbMovieDetails | TmdbTvDetails) | null;
  const trailer = raw ? findTrailer(raw.videos) : null;
  const externalIds = raw?.external_ids;
  const cast = raw?.credits?.cast ?? [];
  // Streaming-original TV shows are often thinly credited on production
  // companies but always carry a network (Netflix, Apple TV+, etc.) — fall
  // back to that so the Studio section isn't empty for those.
  const companies =
    raw?.production_companies?.length
      ? raw.production_companies
      : type === "tv"
        ? ((raw as TmdbTvDetails | null)?.networks ?? [])
        : [];

  const similarItems: SimilarTitle[] = (raw?.recommendations?.results ?? []).map((item) => ({
    tmdbId: item.id,
    mediaType: type,
    name: item.title || item.name || "",
    posterPath: item.poster_path,
    year: (item.release_date || item.first_air_date || "").slice(0, 4) || null,
  }));

  const similarStatusMap = session?.user
    ? await getLibraryStatusMap(
        session.user.id,
        similarItems.map((i) => ({ mediaType: i.mediaType, tmdbId: i.tmdbId })),
      )
    : new Map();

  // Movie franchises (Harry Potter, James Bond, etc.) come straight from
  // TMDb's own "collection" data. TV crossovers (Arrowverse, 9-1-1 universe)
  // have no TMDb equivalent, so those come from a hand-curated list instead.
  let franchiseTitle: string | null = null;
  let franchiseItems: FranchiseItem[] = [];

  if (type === "movie") {
    const collectionRef = (raw as TmdbMovieDetails | null)?.belongs_to_collection;
    if (collectionRef) {
      const collection = await getCollection(collectionRef.id).catch(() => null);
      if (collection) {
        franchiseTitle = collection.name;
        franchiseItems = [...collection.parts]
          .sort((a, b) => (a.release_date || "").localeCompare(b.release_date || ""))
          .map((part) => ({
            tmdbId: part.id,
            mediaType: "movie" as MediaType,
            name: part.title,
            posterPath: part.poster_path,
            year: (part.release_date || "").slice(0, 4) || null,
          }));
      }
    }
  } else {
    const group = findTvFranchiseGroup(tmdbId);
    if (group) {
      const members = await Promise.all(
        group.memberTmdbIds.map((memberId) => getOrFetchTitle("tv", memberId).catch(() => null)),
      );
      franchiseTitle = group.displayName;
      franchiseItems = members
        .filter((m): m is NonNullable<typeof m> => m !== null)
        .map((m) => ({
          tmdbId: m.tmdbId,
          mediaType: "tv" as MediaType,
          name: m.name,
          posterPath: m.posterPath,
          year: (m.releaseDate || m.firstAirDate || "").slice(0, 4) || null,
        }));
    }
  }

  const franchiseStatusMap =
    session?.user && franchiseItems.length > 0
      ? await getLibraryStatusMap(
          session.user.id,
          franchiseItems.map((i) => ({ mediaType: i.mediaType, tmdbId: i.tmdbId })),
        )
      : new Map();

  const seasons = type === "tv" ? (raw as TmdbTvDetails | null)?.seasons?.filter((s) => s.episode_count > 0) ?? [] : [];
  const defaultSeason = seasons.find((s) => s.season_number > 0)?.season_number ?? seasons[0]?.season_number ?? 1;
  const selectedSeason = season !== undefined && Number.isFinite(Number(season)) ? Number(season) : defaultSeason;
  const episodes =
    type === "tv" && seasons.length > 0
      ? await getTvSeasonDetails(tmdbId, selectedSeason).catch(() => null)
      : null;

  const sonarrBreakdown =
    type === "tv" && seasons.length > 0 && session?.user
      ? await getSonarrSeasonBreakdown(session.user.id, title.tvdbId, selectedSeason).catch(() => null)
      : null;

  return (
    <div>
      <TitleHero
        mediaType={type}
        tmdbId={tmdbId}
        name={title.name}
        overview={title.overview}
        posterPath={title.posterPath}
        backdropPath={title.backdropPath}
        year={year}
        status={libraryStatus.status}
        configured={libraryStatus.configured}
        file={libraryStatus.file}
        links={{
          trailerKey: trailer?.key ?? null,
          imdbId: title.imdbId,
          facebookId: externalIds?.facebook_id ?? null,
          instagramId: externalIds?.instagram_id ?? null,
          twitterId: externalIds?.twitter_id ?? null,
        }}
      />

      <div className="mx-auto max-w-6xl flex-col gap-12 px-6 pb-20 pt-4 flex">
        {seasons.length > 0 && (
          <section>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-xl text-text-primary">Episodes</h2>
              <SeasonSelector
                seasons={seasons}
                selectedSeason={selectedSeason}
                basePath={`/title/tv/${tmdbId}`}
                completeness={sonarrBreakdown?.seasonCompleteness}
              />
            </div>
            <EpisodeList
              episodes={episodes?.episodes ?? []}
              hasFileMap={sonarrBreakdown?.episodeHasFile}
            />
          </section>
        )}

        <CastRow cast={cast} />
        {franchiseTitle && (
          <FranchiseRow title={franchiseTitle} items={franchiseItems} statusMap={franchiseStatusMap} />
        )}
        <StudioRow companies={companies} />
        <SimilarTitlesRow items={similarItems} statusMap={similarStatusMap} />
      </div>
    </div>
  );
}
