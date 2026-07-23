import { notFound } from "next/navigation";
import { TitleHero, type TitleMeta, type TitleSidebarData } from "@/components/title-hero";
import { CastRow } from "@/components/cast-row";
import { StudioRow } from "@/components/studio-row";
import { SimilarTitlesRow, type SimilarTitle } from "@/components/similar-titles-row";
import { FranchiseRow, type FranchiseItem } from "@/components/franchise-row";
import { SeasonAccordion } from "@/components/season-episode-list";
import { getOrFetchTitle } from "@/lib/tmdb/cache";
import { formatRuntime, formatDateLabel, languageLabel, countryCodeToFlagEmoji } from "@/lib/format";
import { computeYearRange, relabelTvStatus, extractMovieCredits, extractTvCredits } from "@/lib/title-meta";
import { getTitleLibraryStatus, getSonarrSeasonCompleteness, getArrTrackingInfo } from "@/lib/integrations/status";
import { getLibraryStatusMap } from "@/lib/library/query";
import { findTrailer, getCollection } from "@/lib/tmdb/client";
import { findTvFranchiseGroup } from "@/lib/tmdb/tv-franchise-groups";
import { getArrCredential, isArrFullyConfigured } from "@/lib/integrations/credentials";
import { isFavorited, getFavoritedTmdbIds } from "@/lib/favorites/query";
import { getActiveRequestStatus, getActiveRequestStatusMap, getOtherPendingRequesters } from "@/lib/requests/query";
import { getViewerContext } from "@/lib/integrations/library-owner";
import type { MediaType } from "@/lib/db/schema";
import type { TmdbMovieDetails, TmdbTvDetails } from "@/lib/tmdb/client";

export default async function TitlePage({
  params,
}: {
  params: Promise<{ type: string; id: string }>;
}) {
  const { type, id } = await params;
  const tmdbId = Number(id);
  if ((type !== "movie" && type !== "tv") || !Number.isFinite(tmdbId)) notFound();

  // Independent of each other — the viewer lookup doesn't need the title,
  // and vice versa — so there's no reason to serialize them.
  const [viewer, title] = await Promise.all([
    getViewerContext(),
    getOrFetchTitle(type as MediaType, tmdbId).catch(() => undefined),
  ]);
  if (!title) notFound();

  const year = (title.releaseDate || title.firstAirDate || "").slice(0, 4) || null;

  const libraryStatus = viewer.libraryOwnerId
    ? await getTitleLibraryStatus(viewer.libraryOwnerId, type, tmdbId, title.tvdbId)
    : { status: "untracked" as const, configured: false, file: null };

  const [titleFavorited, radarrCredential, sonarrCredential, activeRequestStatus, otherRequesters] =
    viewer.session
      ? await Promise.all([
          isFavorited(viewer.userId, type, tmdbId),
          getArrCredential(viewer.userId, "radarr"),
          getArrCredential(viewer.userId, "sonarr"),
          getActiveRequestStatus(viewer.userId, type, tmdbId),
          getOtherPendingRequesters(type, tmdbId, viewer.userId),
        ])
      : [undefined, null, null, null, []];
  const arrConfigured = {
    movie: isArrFullyConfigured(radarrCredential),
    tv: isArrFullyConfigured(sonarrCredential),
  };

  // Only worth a live Radarr/Sonarr round-trip when there's actually an
  // admin control that would use it — non-admin viewers never see the
  // Search now/monitoring toggle.
  const arrTracking =
    viewer.session && viewer.isAdmin && viewer.libraryOwnerId
      ? await getArrTrackingInfo(viewer.libraryOwnerId, type, tmdbId, title.tvdbId).catch(() => null)
      : null;

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

  const [similarStatusMap, similarRequestStatusMap, similarFavoritedIds, castFavoritedIds, companyFavoritedIds] =
    viewer.libraryOwnerId
      ? await Promise.all([
          getLibraryStatusMap(
            viewer.libraryOwnerId,
            similarItems.map((i) => ({ mediaType: i.mediaType, tmdbId: i.tmdbId })),
          ),
          getActiveRequestStatusMap(
            viewer.userId,
            similarItems.map((i) => ({ mediaType: i.mediaType, tmdbId: i.tmdbId })),
          ),
          getFavoritedTmdbIds(
            viewer.userId,
            type,
            similarItems.map((i) => i.tmdbId),
          ),
          getFavoritedTmdbIds(
            viewer.userId,
            "person",
            cast.map((c) => c.id),
          ),
          getFavoritedTmdbIds(
            viewer.userId,
            "company",
            companies.map((c) => c.id),
          ),
        ])
      : [new Map(), new Map(), new Set<number>(), new Set<number>(), new Set<number>()];

  // Movie franchises (Harry Potter, James Bond, etc.) come straight from
  // TMDb's own "collection" data. TV crossovers (Arrowverse, 9-1-1 universe)
  // have no TMDb equivalent, so those come from a hand-curated list instead.
  let franchiseTitle: string | null = null;
  let franchiseItems: FranchiseItem[] = [];
  let collectionId: number | undefined;

  if (type === "movie") {
    const collectionRef = (raw as TmdbMovieDetails | null)?.belongs_to_collection;
    if (collectionRef) {
      collectionId = collectionRef.id;
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

  const [franchiseStatusMap, franchiseRequestStatusMap, franchiseFavoritedIds, collectionFavorited] =
    viewer.libraryOwnerId && franchiseItems.length > 0
      ? await Promise.all([
          getLibraryStatusMap(
            viewer.libraryOwnerId,
            franchiseItems.map((i) => ({ mediaType: i.mediaType, tmdbId: i.tmdbId })),
          ),
          getActiveRequestStatusMap(
            viewer.userId,
            franchiseItems.map((i) => ({ mediaType: i.mediaType, tmdbId: i.tmdbId })),
          ),
          getFavoritedTmdbIds(
            viewer.userId,
            type,
            franchiseItems.map((i) => i.tmdbId),
          ),
          collectionId !== undefined
            ? isFavorited(viewer.userId, "collection", collectionId)
            : Promise.resolve(false),
        ])
      : [new Map(), new Map(), new Set<number>(), false];

  const seasons = type === "tv" ? (raw as TmdbTvDetails | null)?.seasons?.filter((s) => s.episode_count > 0) ?? [] : [];

  const seasonCompleteness =
    type === "tv" && seasons.length > 0 && viewer.libraryOwnerId
      ? await getSonarrSeasonCompleteness(viewer.libraryOwnerId, title.tvdbId).catch(() => null)
      : null;

  // Movies: TMDb's own runtime. TV: averaged across TMDb's per-episode
  // runtimes (Sonarr has no per-series runtime, and episode-to-episode
  // length can vary), so it's clearly labeled as an average, not exact.
  const runtimeLabel =
    type === "movie"
      ? (raw as TmdbMovieDetails | null)?.runtime
        ? formatRuntime((raw as TmdbMovieDetails).runtime!)
        : null
      : (() => {
          const episodeRuntimes = (raw as TmdbTvDetails | null)?.episode_run_time;
          if (!episodeRuntimes?.length) return null;
          const avg = Math.round(
            episodeRuntimes.reduce((sum, m) => sum + m, 0) / episodeRuntimes.length,
          );
          return `~${formatRuntime(avg)}/episode`;
        })();

  const endYear =
    type === "tv" ? (raw as TmdbTvDetails | null)?.last_air_date?.slice(0, 4) || null : null;
  const titleMeta: TitleMeta = {
    runtimeLabel,
    ratingPercent: raw?.vote_average ? Math.round(raw.vote_average * 10) : null,
    genres: (raw?.genres ?? []).map((g) => g.name).slice(0, 3),
    yearRange: computeYearRange(year, endYear),
    statusLabel: relabelTvStatus(raw?.status ?? null),
    network: type === "tv" ? ((raw as TmdbTvDetails | null)?.networks?.[0]?.name ?? null) : null,
  };

  const credits =
    type === "movie"
      ? extractMovieCredits((raw as TmdbMovieDetails | null)?.credits?.crew ?? [])
      : extractTvCredits(
          (raw as TmdbTvDetails | null)?.created_by ?? [],
          (raw as TmdbTvDetails | null)?.credits?.crew ?? [],
        );

  const keywords =
    type === "movie"
      ? ((raw as TmdbMovieDetails | null)?.keywords?.keywords ?? []).map((k) => k.name)
      : ((raw as TmdbTvDetails | null)?.keywords?.results ?? []).map((k) => k.name);

  const watchProviders = (raw?.["watch/providers"]?.results?.US?.flatrate ?? []).map((p) => ({
    name: p.provider_name,
    logoPath: p.logo_path,
  }));

  const productionCountryRaw = raw?.production_countries?.[0];
  const titleSidebar: TitleSidebarData = {
    releaseDateLabel: formatDateLabel(title.releaseDate || title.firstAirDate),
    nextAirDateLabel:
      type === "tv" ? formatDateLabel((raw as TmdbTvDetails | null)?.next_episode_to_air?.air_date) : null,
    originalLanguageLabel: languageLabel(raw?.original_language),
    productionCountry: productionCountryRaw
      ? { name: productionCountryRaw.name, flag: countryCodeToFlagEmoji(productionCountryRaw.iso_3166_1) }
      : null,
    watchProviders,
  };

  return (
    <div>
      <TitleHero
        mediaType={type}
        tmdbId={tmdbId}
        name={title.name}
        overview={title.overview}
        tagline={raw?.tagline}
        posterPath={title.posterPath}
        backdropPath={title.backdropPath}
        meta={titleMeta}
        sidebar={titleSidebar}
        credits={credits}
        keywords={keywords}
        status={libraryStatus.status}
        configured={libraryStatus.configured}
        links={{
          trailerKey: trailer?.key ?? null,
          imdbId: title.imdbId,
          facebookId: externalIds?.facebook_id ?? null,
          instagramId: externalIds?.instagram_id ?? null,
          twitterId: externalIds?.twitter_id ?? null,
          tvdbId: title.tvdbId,
          tvdbMediaType: type === "tv" ? "series" : "movies",
        }}
        favorited={titleFavorited}
        isAdmin={viewer.session ? viewer.isAdmin : undefined}
        alreadyRequested={activeRequestStatus === "pending"}
        otherRequesters={otherRequesters}
        tvdbId={title.tvdbId}
        arrTracking={arrTracking}
        file={libraryStatus.file}
        runtimeLabel={runtimeLabel}
      />

      <div className="mx-auto max-w-6xl flex-col gap-12 px-6 pb-20 pt-4 flex">
        {seasons.length > 0 && (
          <section>
            <h2 className="mb-4 font-display text-xl text-text-primary">Episodes</h2>
            <SeasonAccordion
              seasons={seasons}
              tmdbId={tmdbId}
              tvdbId={title.tvdbId}
              completeness={seasonCompleteness ?? undefined}
            />
          </section>
        )}

        <CastRow cast={cast} favoritedIds={castFavoritedIds} showFavorite={Boolean(viewer.session)} />
        {franchiseTitle && (
          <FranchiseRow
            title={franchiseTitle}
            items={franchiseItems}
            statusMap={franchiseStatusMap}
            requestStatusMap={franchiseRequestStatusMap}
            favoritedIds={franchiseFavoritedIds}
            showFavorite={Boolean(viewer.session)}
            arrConfigured={viewer.session ? arrConfigured : undefined}
            collectionId={collectionId}
            collectionFavorited={collectionFavorited}
            isAdmin={viewer.session ? viewer.isAdmin : undefined}
          />
        )}
        <StudioRow companies={companies} favoritedIds={companyFavoritedIds} showFavorite={Boolean(viewer.session)} />
        <SimilarTitlesRow
          items={similarItems}
          statusMap={similarStatusMap}
          requestStatusMap={similarRequestStatusMap}
          favoritedIds={similarFavoritedIds}
          showFavorite={Boolean(viewer.session)}
          arrConfigured={viewer.session ? arrConfigured : undefined}
          isAdmin={viewer.session ? viewer.isAdmin : undefined}
        />
      </div>
    </div>
  );
}
