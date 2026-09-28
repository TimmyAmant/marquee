import type { TitleMeta, TitleSidebarData } from "@/components/title-hero";
import { findBlock, getBlockedTitleKeys } from "@/lib/requests/blocklist";
import { getOpenIssuesFor } from "@/lib/issues";
import { getTitleNotFoundSince } from "@/lib/requests/not-found";
import { can, NO_PERMISSIONS, permissionMap } from "@/lib/users/permissions";
import { getAccess } from "@/lib/users/access";
import { getFourKStatus } from "@/lib/arr/fourk";
import { getArrLinks } from "@/lib/arr/title-links";
import { seesArrLinks, type ArrLink } from "@/lib/arr/links";
import type { SimilarTitle } from "@/components/similar-titles-row";
import type { FranchiseItem } from "@/components/franchise-row";
import type { LibraryStatus } from "@/components/status-badge";
import { isUnwanted } from "@/lib/library/status-tone";
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
import { getEpisodeCountMap, getLibraryStatusMap } from "@/lib/library/query";
import type { EpisodeCounts } from "@/lib/library/episode-counts";
import { findTrailer, getCollection } from "@/lib/tmdb/client";
import { findTvFranchiseGroup } from "@/lib/tmdb/tv-franchise-groups";
import { getArrCredential, isArrFullyConfigured } from "@/lib/integrations/credentials";
import { isFavorited, getFavoritedTmdbIds } from "@/lib/favorites/query";
import {
  getActiveRequestStatus,
  getActiveRequestStatusMap,
  getOtherPendingRequesters,
  getViewerTitleRequests,
  getViewerRequestsForTitle,
} from "@/lib/requests/query";
import { canRequestSeasons, seasonRequestStates, summarizeViewerRequests } from "@/lib/requests/seasons";
import type { ViewerIdentity } from "@/lib/integrations/library-owner";
import type { MediaType, RequestStatus } from "@/lib/db/schema";
import type { TmdbMovieDetails, TmdbSeasonSummary, TmdbTvDetails } from "@/lib/tmdb/client";
import { getLocale, getT } from "@/lib/i18n/server";
import { getTitleTranslation } from "@/lib/tmdb/translations";
import { overlayTitle } from "@/lib/tmdb/language";
import { formatNumber, regionName } from "@/lib/i18n/format";
import { getTitleRatings } from "@/lib/ratings/cache";
import { getPlayableItems } from "@/lib/media-servers/query";
import { buildPlayLinks, type PlayLink } from "@/lib/media-servers/play-links";
import { moneyOrNull, originalTitleOf, releaseDatesFor, streamingProvidersFor } from "@/lib/titles/facts";
import { getDiscoverLocale } from "@/lib/tmdb/client";
import { dedupeCompanies } from "@/lib/tmdb/company-groups";

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
  // What this viewer may do here (lib/users/permissions.ts), read fresh.
  const access = viewer.userId ? await getAccess(viewer.userId).catch(() => null) : null;
  const permissions = access ? permissionMap(access) : NO_PERMISSIONS;
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
      !isUnwanted(libraryStatus.status) &&
      (libraryStatus.provider === "plex" || libraryStatus.provider === "jellyfin"),
  });
  // The 4K copy (lib/arr/fourk.ts): what the 4K instance has, and this
  // viewer's 4K request. Null when there's no 4K instance for this type.
  // "Open in Radarr/Sonarr" (lib/arr/links.ts): only for the admin and
  // whoever reviews requests, asked alongside the 4K servers.
  const [fourKLibrary, fourKRequestStatus, arrLinks] =
    viewer.userId && viewer.libraryOwnerId
      ? await Promise.all([
          getFourKStatus(viewer.libraryOwnerId, type, tmdbId, tvdbId).catch(() => null),
          getActiveRequestStatus(viewer.userId, type, tmdbId, true),
          seesArrLinks(access)
            ? getArrLinks(viewer.libraryOwnerId, type, tmdbId, tvdbId).catch(() => [] as ArrLink[])
            : ([] as ArrLink[]),
        ])
      : [null, null, [] as ArrLink[]];
  const fourK = fourKLibrary ? { ...fourKLibrary, requestStatus: fourKRequestStatus } : null;
  const openReports = viewer.userId ? await getOpenIssuesFor(viewer.userId, type, tmdbId) : 0;
  const blocked = viewer.userId ? await findBlock(type, tmdbId).catch(() => null) : null;
  // "Can't find" (lib/requests/not-found.ts), for whoever reviews requests.
  const reviews = viewer.userId !== null && can(access, "reviewRequests");
  const notFoundSince = reviews ? await getTitleNotFoundSince(type, tmdbId).catch(() => null) : null;
  // The viewer's own requests, for Cancel / Edit and their conversations.
  const myRequests = viewer.userId ? await getViewerRequestsForTitle(viewer.userId, type, tmdbId) : [];

  const seasonRequests = {
    states: seasonStates,
    canRequestSeasons: canRequestSeasons({
      // Only for someone who may request TV at all.
      isMember: isMember && permissions.requestTv,
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
    myRequests,
    permissions,
    arrLinks,
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
  const english = await getOrFetchTitle(type, tmdbId).catch(() => undefined);
  if (!english) return null;
  const t = await getT();
  // In the viewer's language (lib/tmdb/translations.ts): the name,
  // overview, tagline, poster, genres, season names, logo and trailer TMDb
  // has for it, each falling back to English. Everything else is shared.
  const translation = await getTitleTranslation(english, await getLocale()).catch(() => null);
  const localized = overlayTitle(english, english.rawTmdb as (TmdbMovieDetails | TmdbTvDetails) | null, translation);
  const title = { ...localized.title, rawTmdb: localized.raw };

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
    myRequests,
    permissions,
    arrLinks,
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
  // The similar and franchise rows' series posters' have/total, in one read.
  const episodeCounts = viewer.libraryOwnerId
    ? await getEpisodeCountMap(viewer.libraryOwnerId, [...similarItems, ...franchiseItems])
    : new Map<string, EpisodeCounts>();

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
        ? formatRuntime(t, runtimeMinutes)
        : t("title.runtimePerEpisode", { runtime: formatRuntime(t, runtimeMinutes) });

  const endYear =
    type === "tv" ? (raw as TmdbTvDetails | null)?.last_air_date?.slice(0, 4) || null : null;
  const titleMeta: TitleMeta = {
    runtimeLabel,
    ratingPercent: raw?.vote_average ? Math.round(raw.vote_average * 10) : null,
    genres: (raw?.genres ?? []).map((g) => g.name).slice(0, 3),
    yearRange: computeYearRange(year, endYear),
    statusLabel: relabelTvStatus(t, raw?.status ?? null),
    network: type === "tv" ? ((raw as TmdbTvDetails | null)?.networks?.[0]?.name ?? null) : null,
  };

  const credits =
    type === "movie"
      ? extractMovieCredits(t, (raw as TmdbMovieDetails | null)?.credits?.crew ?? [])
      : extractTvCredits(
          t,
          (raw as TmdbTvDetails | null)?.created_by ?? [],
          (raw as TmdbTvDetails | null)?.credits?.crew ?? [],
        );

  const keywords =
    type === "movie"
      ? ((raw as TmdbMovieDetails | null)?.keywords?.keywords ?? []).map((k) => k.name)
      : ((raw as TmdbTvDetails | null)?.keywords?.results ?? []).map((k) => k.name);

  // "Currently streaming on" and a movie's release dates are for the
  // streaming region (Settings › Discover › Region & language).
  const { streamingRegion } = await getDiscoverLocale();
  const streaming = streamingProvidersFor(raw?.["watch/providers"], streamingRegion);
  const watchProviders = streaming.providers.map((p) => ({ name: p.name, logoPath: p.logoPath }));

  // IMDb / Rotten Tomatoes / Metacritic, with an OMDb key (lib/ratings);
  // where the title can be played, from the library sync
  // (lib/media-servers). Both fail soft: the page shows what it has.
  const [ratings, playableItems] = await Promise.all([
    getTitleRatings(type, tmdbId, title.imdbId).catch(() => null),
    viewer.libraryOwnerId ? getPlayableItems(viewer.libraryOwnerId, type, tmdbId, title.tvdbId).catch(() => []) : [],
  ]);
  const playLinks: PlayLink[] = buildPlayLinks(t, playableItems, type);

  const movieRaw = type === "movie" ? (raw as TmdbMovieDetails | null) : null;
  const releaseDates = movieRaw ? releaseDatesFor(movieRaw.release_dates, streamingRegion) : null;
  const budget = moneyOrNull(movieRaw?.budget);
  const revenue = moneyOrNull(movieRaw?.revenue);
  const money = (value: number | null) =>
    value === null ? null : formatNumber(t, value, { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  const productionCountryRaw = raw?.production_countries?.[0];
  const nextAirDate = type === "tv" ? ((raw as TmdbTvDetails | null)?.next_episode_to_air?.air_date ?? null) : null;
  const titleSidebar: TitleSidebarData = {
    releaseDateLabel: formatDateLabel(t, title.releaseDate || title.firstAirDate),
    nextAirDateLabel: type === "tv" ? formatDateLabel(t, nextAirDate) : null,
    originalLanguageLabel: languageLabel(t, raw?.original_language),
    productionCountry: productionCountryRaw
      ? {
          name: regionName(t, productionCountryRaw.iso_3166_1) ?? productionCountryRaw.name,
          flag: countryCodeToFlagEmoji(productionCountryRaw.iso_3166_1),
        }
      : null,
    watchProviders,
    streamingRegion: streaming.region,
    streamingLink: streaming.link,
    originalTitle: originalTitleOf(type, raw, title.name),
    theatricalReleaseLabel: formatDateLabel(t, releaseDates?.theatrical),
    digitalReleaseLabel: formatDateLabel(t, releaseDates?.digital),
    budgetLabel: money(budget),
    revenueLabel: money(revenue),
    // The first studio (a movie) — a show's network is its own row.
    studio: type === "movie" ? (dedupeCompanies(companies)[0]?.name ?? null) : null,
    ratings,
    imdbId: title.imdbId,
  };

  return {
    title,
    raw,
    year,
    permissions,
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
    episodeCounts,
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
    myRequests,
    arrLinks,
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
    releaseDates,
    budget,
    revenue,
    playLinks,
  };
}
