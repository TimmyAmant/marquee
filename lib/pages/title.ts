import type { TitleMeta, TitleSidebarData } from "@/components/title-hero";
import { findBlock, getBlockedTitleKeys } from "@/lib/requests/blocklist";
import { getOpenIssuesFor } from "@/lib/issues";
import { getTitleNotFoundSince } from "@/lib/requests/not-found";
import { roleOf } from "@/lib/notifications/preferences";
import { canReviewRequests } from "@/lib/users/roles";
import { getFourKStatus } from "@/lib/arr/fourk";
import type { SimilarTitle } from "@/components/similar-titles-row";
import type { FranchiseItem } from "@/components/franchise-row";
import type { LibraryStatus } from "@/components/status-badge";
import { getOrFetchTitle } from "@/lib/tmdb/cache";
import { formatRuntime, formatDateLabel, languageLabel, countryCodeToFlagEmoji } from "@/lib/format";
import { computeYearRange, relabelTvStatus, extractMovieCredits, extractTvCredits } from "@/lib/title-meta";
import {
  getTitleLibraryStatus,
  getSonarrSeasonStates,
  seasonCompletenessOf,
  getArrTrackingInfo,
} from "@/lib/integrations/status";
import type { TitleLibraryStatus } from "@/lib/integrations/status";
import { getLibraryStatusMap } from "@/lib/library/query";
import { findTrailer, getCollection } from "@/lib/tmdb/client";
import { findTvFranchiseGroup } from "@/lib/tmdb/tv-franchise-groups";
import { getArrCredential, isArrFullyConfigured } from "@/lib/integrations/credentials";
import { isFavorited, getFavoritedTmdbIds } from "@/lib/favorites/query";
import {
  getActiveRequestStatus,
  getActiveRequestStatusMap,
  getOtherPendingRequesters,
  getViewerTitleRequests,
} from "@/lib/requests/query";
import { canRequestSeasons, seasonRequestStates, summarizeViewerRequests } from "@/lib/requests/seasons";
import type { ViewerIdentity } from "@/lib/integrations/library-owner";
import type { MediaType, RequestStatus } from "@/lib/db/schema";
import type { TmdbMovieDetails, TmdbSeasonSummary, TmdbTvDetails } from "@/lib/tmdb/client";

/**
 * The title page's library status plus this viewer's state for it (favorite,
 * requests, Sonarr/Radarr configuration and — admin only — live tracking
 * info). Part of loadTitlePage, and on its own behind
 * GET /api/v1/titles/[type]/[id]/status for a cheap refresh after an action.
 */
export async function loadTitleStatus(
  viewer: ViewerIdentity,
  type: MediaType,
  tmdbId: number,
  tvdbId: number | null,
  tvSeasons: TmdbSeasonSummary[] = [],
) {
  const libraryStatus: Pick<TitleLibraryStatus, "status" | "configured" | "file"> &
    Partial<Pick<TitleLibraryStatus, "provider">> = viewer.libraryOwnerId
    ? await getTitleLibraryStatus(viewer.libraryOwnerId, type, tmdbId, tvdbId)
    : { status: "untracked" as const, configured: false, file: null };

  const [titleFavorited, radarrCredential, sonarrCredential, activeRequestStatus, otherRequesters] =
    viewer.userId
      ? await Promise.all([
          isFavorited(viewer.userId, type, tmdbId),
          getArrCredential(viewer.userId, "radarr"),
          getArrCredential(viewer.userId, "sonarr"),
          getActiveRequestStatus(viewer.userId, type, tmdbId),
          getOtherPendingRequesters(type, tmdbId, viewer.userId),
        ])
      : [undefined, null, null, null as RequestStatus | null, [] as string[]];
  const arrConfigured = {
    movie: isArrFullyConfigured(radarrCredential),
    tv: isArrFullyConfigured(sonarrCredential),
  };

  // Only worth a live Radarr/Sonarr round-trip when there's actually an
  // admin control that would use it — non-admin viewers never see the
  // Search now/monitoring toggle.
  const arrTracking =
    viewer.userId && viewer.isAdmin && viewer.libraryOwnerId
      ? await getArrTrackingInfo(viewer.libraryOwnerId, type, tmdbId, tvdbId).catch(() => null)
      : null;

  // Per-season state for a show: what Sonarr has of each season (also the
  // accordion's have/total badges) and, for a member, which seasons they've
  // asked for and which they still can.
  const isMember = viewer.userId !== null && !viewer.isAdmin;
  const [seasonLibrary, viewerRequests] =
    type === "tv" && tvSeasons.length > 0 && viewer.userId
      ? await Promise.all([
          getSonarrSeasonStates(viewer.libraryOwnerId, tvdbId).catch(() => null),
          isMember ? getViewerTitleRequests(viewer.userId, type, tmdbId) : Promise.resolve([]),
        ])
      : [null, []];
  const seasonNumbers = tvSeasons.map((s) => s.season_number);
  // Once Sonarr is connected, it answers whether an approved season is on
  // its way — including when the show was deleted there since (no record),
  // which makes those seasons requestable again. Without Sonarr, the
  // approved requests are all there is to go on.
  const sonarrConnected = isArrFullyConfigured(sonarrCredential);
  const viewerSeasons = summarizeViewerRequests(viewerRequests, seasonNumbers, seasonLibrary !== null || sonarrConnected);
  const seasonStates = seasonRequestStates({
    seasonNumbers,
    library: seasonLibrary,
    requested: viewerSeasons.requested,
    isMember,
    ownedOutsideSonarr:
      seasonLibrary === null &&
      libraryStatus.status !== "untracked" &&
      (libraryStatus.provider === "plex" || libraryStatus.provider === "jellyfin"),
  });
  // The 4K copy (lib/arr/fourk.ts): what the 4K instance has, and this
  // viewer's 4K request. Null when there's no 4K instance for this type.
  const [fourKLibrary, fourKRequestStatus] =
    viewer.userId && viewer.libraryOwnerId
      ? await Promise.all([
          getFourKStatus(viewer.libraryOwnerId, type, tmdbId, tvdbId).catch(() => null),
          getActiveRequestStatus(viewer.userId, type, tmdbId, true),
        ])
      : [null, null];
  const fourK = fourKLibrary ? { ...fourKLibrary, requestStatus: fourKRequestStatus } : null;
  const openReports = viewer.userId ? await getOpenIssuesFor(viewer.userId, type, tmdbId) : 0;
  const blocked = viewer.userId ? await findBlock(type, tmdbId).catch(() => null) : null;
  // "Can't find" (lib/requests/not-found.ts), for whoever reviews requests.
  const reviews = viewer.userId !== null && (viewer.isAdmin || canReviewRequests(await roleOf(viewer.userId).catch(() => null)));
  const notFoundSince = reviews ? await getTitleNotFoundSince(type, tmdbId).catch(() => null) : null;

  const seasonRequests = {
    states: seasonStates,
    canRequestSeasons: canRequestSeasons({
      isMember,
      isTv: type === "tv",
      hasPending: viewerSeasons.hasPending,
      states: seasonStates,
    }),
    requestedSeasons: viewerSeasons.pendingSeasons,
  };

  return {
    libraryStatus,
    titleFavorited,
    activeRequestStatus,
    otherRequesters,
    arrConfigured,
    arrTracking,
    seasonLibrary,
    seasonRequests,
    fourK,
    openReports,
    blocked,
    notFoundSince,
  };
}

/** The seasons the title page lists for a show: every one TMDb has that has
 * episodes. Empty for a movie. */
export function tvSeasonsOf(type: MediaType, raw: unknown): TmdbSeasonSummary[] {
  if (type !== "tv") return [];
  return ((raw as TmdbTvDetails | null)?.seasons ?? []).filter((s) => s.episode_count > 0);
}

/**
 * The title's franchise row: a movie's TMDb collection or a TV show's
 * hand-curated crossover group, with the viewer's library status, own
 * requests and favorites for each member. Part of loadTitlePage, and on its
 * own behind "Request all N missing" (lib/requests/request-all.ts), which
 * works the set out again on the server rather than trusting the client's.
 */
export async function loadFranchise(
  viewer: ViewerIdentity,
  type: MediaType,
  tmdbId: number,
  raw: TmdbMovieDetails | TmdbTvDetails | null,
) {
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
      : [new Map<string, LibraryStatus>(), new Map<string, RequestStatus>(), new Set<number>(), false];

  return {
    franchiseTitle,
    franchiseItems,
    collectionId,
    franchiseStatusMap,
    franchiseRequestStatusMap,
    franchiseFavoritedIds,
    collectionFavorited,
  };
}

/**
 * Everything /title/[type]/[id] renders — hero, sidebar, file details,
 * seasons, cast, franchise, studios, similar titles — with the viewer's
 * library status, favorites, requests and admin controls. Shared by
 * app/title/[type]/[id]/page.tsx and GET /api/v1/titles/[type]/[id].
 * Returns null when TMDb has no such title (the page's notFound()).
 */
export async function loadTitlePage(viewer: ViewerIdentity, type: MediaType, tmdbId: number) {
  const title = await getOrFetchTitle(type, tmdbId).catch(() => undefined);
  if (!title) return null;

  const year = (title.releaseDate || title.firstAirDate || "").slice(0, 4) || null;

  const seasons = tvSeasonsOf(type, title.rawTmdb);
  const {
    libraryStatus,
    titleFavorited,
    activeRequestStatus,
    otherRequesters,
    arrConfigured,
    arrTracking,
    seasonLibrary,
    seasonRequests,
    fourK,
    openReports,
    blocked,
    notFoundSince,
  } = await loadTitleStatus(viewer, type, tmdbId, title.tvdbId, seasons);

  const raw =title.rawTmdb as (TmdbMovieDetails | TmdbTvDetails) | null;
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
      : [
          new Map<string, LibraryStatus>(),
          new Map<string, RequestStatus>(),
          new Set<number>(),
          new Set<number>(),
          new Set<number>(),
        ];

  const {
    franchiseTitle,
    franchiseItems,
    collectionId,
    franchiseStatusMap,
    franchiseRequestStatusMap,
    franchiseFavoritedIds,
    collectionFavorited,
  } = await loadFranchise(viewer, type, tmdbId, raw);

  const seasonCompleteness = seasonLibrary ? seasonCompletenessOf(seasonLibrary) : null;

  // Movies: TMDb's own runtime. TV: averaged across TMDb's per-episode
  // runtimes (Sonarr has no per-series runtime, and episode-to-episode
  // length can vary), so it's clearly labeled as an average, not exact.
  const runtimeMinutes =
    type === "movie"
      ? ((raw as TmdbMovieDetails | null)?.runtime ?? null) || null
      : (() => {
          const episodeRuntimes = (raw as TmdbTvDetails | null)?.episode_run_time;
          if (!episodeRuntimes?.length) return null;
          return Math.round(episodeRuntimes.reduce((sum, m) => sum + m, 0) / episodeRuntimes.length);
        })();
  const runtimeLabel =
    runtimeMinutes === null
      ? null
      : type === "movie"
        ? formatRuntime(runtimeMinutes)
        : `~${formatRuntime(runtimeMinutes)}/episode`;

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
  const nextAirDate = type === "tv" ? ((raw as TmdbTvDetails | null)?.next_episode_to_air?.air_date ?? null) : null;
  const titleSidebar: TitleSidebarData = {
    releaseDateLabel: formatDateLabel(title.releaseDate || title.firstAirDate),
    nextAirDateLabel: type === "tv" ? formatDateLabel(nextAirDate) : null,
    originalLanguageLabel: languageLabel(raw?.original_language),
    productionCountry: productionCountryRaw
      ? { name: productionCountryRaw.name, flag: countryCodeToFlagEmoji(productionCountryRaw.iso_3166_1) }
      : null,
    watchProviders,
  };

  return {
    title,
    raw,
    year,
    libraryStatus,
    titleFavorited,
    activeRequestStatus,
    otherRequesters,
    arrConfigured,
    arrTracking,
    trailer,
    externalIds,
    cast,
    castFavoritedIds,
    companies,
    companyFavoritedIds,
    similarItems,
    similarStatusMap,
    similarRequestStatusMap,
    similarFavoritedIds,
    franchiseTitle,
    franchiseItems,
    collectionId,
    franchiseStatusMap,
    franchiseRequestStatusMap,
    franchiseFavoritedIds,
    collectionFavorited,
    seasons,
    seasonCompleteness,
    seasonRequests,
    fourK,
    openReports,
    blocked,
    notFoundSince,
    // Blocked single titles, for the Request buttons on the franchise and
    // similar-titles rows. (A keyword block there is still refused by the
    // server when pressed.)
    blockedKeys: viewer.userId ? await getBlockedTitleKeys().catch(() => new Set<string>()) : new Set<string>(),
    runtimeMinutes,
    runtimeLabel,
    titleMeta,
    credits,
    keywords,
    titleSidebar,
    nextAirDate,
    productionCountryCode: productionCountryRaw?.iso_3166_1 ?? null,
  };
}
