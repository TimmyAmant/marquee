import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { TitleHero } from "@/components/title-hero";
import { CastRow } from "@/components/cast-row";
import { StudioRow } from "@/components/studio-row";
import { SimilarTitlesRow, type SimilarTitle } from "@/components/similar-titles-row";
import { FranchiseRow, type FranchiseItem } from "@/components/franchise-row";
import { SeasonAccordion } from "@/components/season-episode-list";
import { getOrFetchTitle } from "@/lib/tmdb/cache";
import { getTitleLibraryStatus, getSonarrSeasonCompleteness } from "@/lib/integrations/status";
import { getLibraryStatusMap } from "@/lib/library/query";
import { findTrailer, getCollection } from "@/lib/tmdb/client";
import { findTvFranchiseGroup } from "@/lib/tmdb/tv-franchise-groups";
import { getArrCredential, isArrFullyConfigured } from "@/lib/integrations/credentials";
import { isFavorited, getFavoritedTmdbIds } from "@/lib/favorites/query";
import { getActiveRequestStatus } from "@/lib/requests/query";
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

  const session = await auth();

  const title = await getOrFetchTitle(type as MediaType, tmdbId).catch(() => undefined);
  if (!title) notFound();

  const year = (title.releaseDate || title.firstAirDate || "").slice(0, 4) || null;

  const libraryStatus = session?.user
    ? await getTitleLibraryStatus(session.user.id, type, tmdbId, title.tvdbId)
    : { status: "untracked" as const, configured: false, file: null };

  const [titleFavorited, radarrCredential, sonarrCredential, activeRequestStatus] = session?.user
    ? await Promise.all([
        isFavorited(session.user.id, type, tmdbId),
        getArrCredential(session.user.id, "radarr"),
        getArrCredential(session.user.id, "sonarr"),
        getActiveRequestStatus(session.user.id, type, tmdbId),
      ])
    : [undefined, null, null, null];
  const arrConfigured = {
    movie: isArrFullyConfigured(radarrCredential),
    tv: isArrFullyConfigured(sonarrCredential),
  };

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

  const [similarStatusMap, similarFavoritedIds, castFavoritedIds, companyFavoritedIds] =
    session?.user
      ? await Promise.all([
          getLibraryStatusMap(
            session.user.id,
            similarItems.map((i) => ({ mediaType: i.mediaType, tmdbId: i.tmdbId })),
          ),
          getFavoritedTmdbIds(
            session.user.id,
            type,
            similarItems.map((i) => i.tmdbId),
          ),
          getFavoritedTmdbIds(
            session.user.id,
            "person",
            cast.map((c) => c.id),
          ),
          getFavoritedTmdbIds(
            session.user.id,
            "company",
            companies.map((c) => c.id),
          ),
        ])
      : [new Map(), new Set<number>(), new Set<number>(), new Set<number>()];

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

  const [franchiseStatusMap, franchiseFavoritedIds, collectionFavorited] =
    session?.user && franchiseItems.length > 0
      ? await Promise.all([
          getLibraryStatusMap(
            session.user.id,
            franchiseItems.map((i) => ({ mediaType: i.mediaType, tmdbId: i.tmdbId })),
          ),
          getFavoritedTmdbIds(
            session.user.id,
            type,
            franchiseItems.map((i) => i.tmdbId),
          ),
          collectionId !== undefined
            ? isFavorited(session.user.id, "collection", collectionId)
            : Promise.resolve(false),
        ])
      : [new Map(), new Set<number>(), false];

  const seasons = type === "tv" ? (raw as TmdbTvDetails | null)?.seasons?.filter((s) => s.episode_count > 0) ?? [] : [];

  const seasonCompleteness =
    type === "tv" && seasons.length > 0 && session?.user
      ? await getSonarrSeasonCompleteness(session.user.id, title.tvdbId).catch(() => null)
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
        favorited={titleFavorited}
        isAdmin={session?.user ? session.user.role === "admin" : undefined}
        alreadyRequested={activeRequestStatus === "pending"}
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

        <CastRow cast={cast} favoritedIds={castFavoritedIds} showFavorite={Boolean(session?.user)} />
        {franchiseTitle && (
          <FranchiseRow
            title={franchiseTitle}
            items={franchiseItems}
            statusMap={franchiseStatusMap}
            favoritedIds={franchiseFavoritedIds}
            showFavorite={Boolean(session?.user)}
            arrConfigured={session?.user ? arrConfigured : undefined}
            collectionId={collectionId}
            collectionFavorited={collectionFavorited}
          />
        )}
        <StudioRow companies={companies} favoritedIds={companyFavoritedIds} showFavorite={Boolean(session?.user)} />
        <SimilarTitlesRow
          items={similarItems}
          statusMap={similarStatusMap}
          favoritedIds={similarFavoritedIds}
          showFavorite={Boolean(session?.user)}
          arrConfigured={session?.user ? arrConfigured : undefined}
        />
      </div>
    </div>
  );
}
