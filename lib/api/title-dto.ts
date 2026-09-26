import type { TitleDetail } from "@/lib/api/types";
import { libraryInfo, statusKey, titleCard, titleViewerState } from "@/lib/api/mappers";
import {
  buildExternalLinks,
  franchiseMissingItems,
  franchiseRequestableItems,
  seasonsNewestFirst,
  topBilledCast,
} from "@/lib/title-meta";
import { dedupeCompanies } from "@/lib/tmdb/company-groups";
import type { loadTitlePage } from "@/lib/pages/title";
import type { MediaType } from "@/lib/db/schema";

type TitlePageData = NonNullable<Awaited<ReturnType<typeof loadTitlePage>>>;

/** Maps the title page loader's output onto the API's TitleDetail, applying
 * the same presentation rules the page's components do (cast top-billing,
 * studio de-duplication, season ordering, franchise "Add all" set, which
 * add/request button shows). The viewer is always signed in here. */
export function titleDetailDto(
  type: MediaType,
  tmdbId: number,
  isAdmin: boolean,
  data: TitlePageData,
): TitleDetail {
  const { title, raw, titleMeta, titleSidebar, libraryStatus } = data;

  const cardFor = (
    item: { mediaType: MediaType; tmdbId: number; name: string; posterPath: string | null; year: string | null },
    maps: {
      status: Map<string, string>;
      requests: Map<string, string>;
      favorited: Set<number>;
    },
  ) => {
    const key = statusKey(item.mediaType, item.tmdbId);
    const status = (maps.status.get(key) ?? null) as TitleDetail["library"]["status"] | null;
    const requested = maps.requests.has(key);
    return titleCard(item, {
      status,
      favorited: maps.favorited.has(item.tmdbId),
      requested,
      canQuickAdd: !status && isAdmin && data.arrConfigured[item.mediaType],
      canRequest: !status && !isAdmin,
    });
  };

  const seasonCompleteness = new Map((data.seasonCompleteness ?? []).map((c) => [c.seasonNumber, c]));

  return {
    mediaType: type,
    tmdbId,
    tvdbId: title.tvdbId,
    imdbId: title.imdbId,
    name: title.name,
    overview: title.overview,
    tagline: raw?.tagline || null,
    posterPath: title.posterPath,
    backdropPath: title.backdropPath,
    year: data.year,
    releaseDate: title.releaseDate || title.firstAirDate || null,
    tmdbStatus: title.status,
    facts: {
      runtimeMinutes: data.runtimeMinutes,
      runtimeLabel: titleMeta.runtimeLabel,
      ratingPercent: titleMeta.ratingPercent,
      genres: titleMeta.genres,
      yearRange: titleMeta.yearRange,
      statusLabel: titleMeta.statusLabel,
      network: titleMeta.network,
      releaseDateLabel: titleSidebar.releaseDateLabel,
      nextAirDate: data.nextAirDate,
      nextAirDateLabel: titleSidebar.nextAirDateLabel,
      originalLanguage: raw?.original_language ?? null,
      originalLanguageLabel: titleSidebar.originalLanguageLabel,
      productionCountry:
        titleSidebar.productionCountry && data.productionCountryCode
          ? { code: data.productionCountryCode, ...titleSidebar.productionCountry }
          : null,
      watchProviders: titleSidebar.watchProviders.map((p) => ({ name: p.name, logoPath: p.logoPath ?? null })),
    },
    credits: data.credits,
    keywords: data.keywords,
    links: {
      trailerYoutubeKey: data.trailer?.key ?? null,
      imdbId: title.imdbId,
      tvdbId: title.tvdbId,
      facebookId: data.externalIds?.facebook_id ?? null,
      instagramId: data.externalIds?.instagram_id ?? null,
      twitterId: data.externalIds?.twitter_id ?? null,
      external: buildExternalLinks({
        imdbId: title.imdbId,
        facebookId: data.externalIds?.facebook_id ?? null,
        instagramId: data.externalIds?.instagram_id ?? null,
        twitterId: data.externalIds?.twitter_id ?? null,
        tvdbId: title.tvdbId,
        tvdbMediaType: type === "tv" ? "series" : "movies",
      }).map((link) => ({ label: link.label, url: link.href })),
    },
    library: libraryInfo(libraryStatus),
    viewer: titleViewerState({
      isAdmin,
      status: libraryStatus.status,
      configured: libraryStatus.configured,
      favorited: Boolean(data.titleFavorited),
      requestStatus: data.activeRequestStatus,
      otherRequesters: data.otherRequesters,
      arrTracking: data.arrTracking,
      seasonRequests: data.seasonRequests,
      fourK: data.fourK,
      openReports: data.openReports,
      blocked: data.blocked,
      notFoundSince: data.notFoundSince,
    }),
    seasons: seasonsNewestFirst(data.seasons).map((season) => {
      const stats = seasonCompleteness.get(season.season_number);
      const state = data.seasonRequests.states.get(season.season_number);
      return {
        seasonNumber: season.season_number,
        name: season.name,
        episodeCount: season.episode_count,
        airDate: season.air_date || null,
        posterPath: season.poster_path,
        have: stats ? stats.have : null,
        total: stats ? stats.total : null,
        monitored: state?.monitored ?? null,
        requested: state?.requested ?? false,
        requestable: state?.requestable ?? false,
      };
    }),
    cast: topBilledCast(data.cast).map((member) => ({
      tmdbId: member.id,
      name: member.name,
      character: member.character || null,
      profilePath: member.profile_path,
      order: member.order,
      favorited: data.castFavoritedIds.has(member.id),
    })),
    franchise: data.franchiseTitle
      ? {
          title: data.franchiseTitle,
          collectionId: data.collectionId ?? null,
          collectionFavorited: data.collectionId !== undefined ? Boolean(data.collectionFavorited) : null,
          items: data.franchiseItems.map((item) =>
            cardFor(item, {
              status: data.franchiseStatusMap,
              requests: data.franchiseRequestStatusMap,
              favorited: data.franchiseFavoritedIds,
            }),
          ),
          addAllMissing: franchiseMissingItems(data.franchiseItems, data.franchiseStatusMap, data.arrConfigured, isAdmin),
          requestAllMissing: franchiseRequestableItems(
            data.franchiseItems,
            data.franchiseStatusMap,
            data.franchiseRequestStatusMap,
            data.blockedKeys,
            isAdmin,
          ),
        }
      : null,
    studios: dedupeCompanies(data.companies).map((company) => ({
      tmdbId: company.tmdbId,
      name: company.name,
      logoPath: company.logoPath,
      favorited: data.companyFavoritedIds.has(company.tmdbId),
    })),
    similar: data.similarItems.map((item) =>
      cardFor(item, {
        status: data.similarStatusMap,
        requests: data.similarRequestStatusMap,
        favorited: data.similarFavoritedIds,
      }),
    ),
  };
}
