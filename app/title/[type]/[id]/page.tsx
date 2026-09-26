import { notFound } from "next/navigation";
import { canReportProblem, fourKViewerState, titleViewerState } from "@/lib/api/mappers";
import { TitleHero } from "@/components/title-hero";
import { CastRow } from "@/components/cast-row";
import { StudioRow } from "@/components/studio-row";
import { SimilarTitlesRow } from "@/components/similar-titles-row";
import { FranchiseRow } from "@/components/franchise-row";
import { SeasonAccordion } from "@/components/season-episode-list";
import { getViewerContext } from "@/lib/integrations/library-owner";
import { getPublicBaseUrl } from "@/lib/sharing";
import { loadTitlePage } from "@/lib/pages/title";
import { seasonsNewestFirst } from "@/lib/title-meta";
import { seasonPickerState } from "@/lib/requests/seasons";
import { seasonsLabel } from "@/lib/requests/labels";
import { getT } from "@/lib/i18n/server";

/** The 4K row, with no "Request in 4K" while the title is blocked. */
function fourKFor(
  isAdmin: boolean,
  fourK: Parameters<typeof fourKViewerState>[1],
  blocked: { reason: string | null } | null,
  mayRequest: boolean,
) {
  const state = fourKViewerState(isAdmin, fourK, mayRequest);
  return state && blocked ? { ...state, canRequest: false } : state;
}

export default async function TitlePage({
  params,
}: {
  params: Promise<{ type: string; id: string }>;
}) {
  const { type, id } = await params;
  const tmdbId = Number(id);
  if ((type !== "movie" && type !== "tv") || !Number.isFinite(tmdbId)) notFound();

  const viewer = await getViewerContext();
  const t = await getT();
  // Shared with GET /api/v1/titles/[type]/[id].
  const [data, publicBase] = await Promise.all([
    loadTitlePage(viewer, type, tmdbId),
    viewer.session ? getPublicBaseUrl().catch(() => null) : null,
  ]);
  if (!data) notFound();

  const {
    title,
    raw,
    permissions,
    libraryStatus,
    titleFavorited,
    activeRequestStatus,
    otherRequesters,
    arrConfigured,
    arrTracking,
    fourK,
    openReports,
    blocked,
    notFoundSince,
    myRequests,
    blockedKeys,
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
    runtimeLabel,
    titleMeta,
    credits,
    keywords,
    titleSidebar,
  } = data;
  const mayRequest = { movie: permissions.requestMovies, tv: permissions.requestTv };

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
        seasonPicker={
          type === "tv" && viewer.session && !viewer.isAdmin
            ? {
                // Same order as the Episodes accordion below.
                rows: seasonsNewestFirst(seasons).map((season) => ({
                  seasonNumber: season.season_number,
                  name: season.name,
                  episodeCount: season.episode_count,
                  state: seasonPickerState(seasonRequests.states.get(season.season_number)),
                })),
                canRequestSeasons: seasonRequests.canRequestSeasons,
                requestedSeasonsLabel: seasonsLabel(t, seasonRequests.requestedSeasons),
              }
            : undefined
        }
        tvdbId={title.tvdbId}
        arrTracking={arrTracking}
        fourK={
          viewer.session
            ? fourKFor(viewer.isAdmin, fourK, blocked, permissions[type === "movie" ? "request4kMovies" : "request4kTv"])
            : null
        }
        blocked={viewer.session ? blocked : null}
        notFoundSince={notFoundSince?.toISOString() ?? null}
        report={
          viewer.session && permissions.reportIssues && canReportProblem(libraryStatus.status, fourK?.status ?? null)
            ? { seasonNumbers: seasons.map((s) => s.season_number), openReports }
            : null
        }
        share={viewer.session ? { publicBase } : null}
        myRequests={
          // The same summaries the API's `viewer.myRequests` carries.
          titleViewerState({
            t,
            isAdmin: viewer.isAdmin,
            mediaType: type,
            permissions,
            status: libraryStatus.status,
            configured: libraryStatus.configured,
            favorited: false,
            requestStatus: null,
            otherRequesters: [],
            arrTracking: null,
            myRequests,
          }).myRequests
        }
        may={
          viewer.session
            ? {
                request: mayRequest[type],
                advanced: permissions.advancedRequests,
                manageBlocklist: permissions.manageBlocklist,
              }
            : undefined
        }
        file={libraryStatus.file}
        runtimeLabel={runtimeLabel}
        cast={
          <CastRow cast={cast} favoritedIds={castFavoritedIds} showFavorite={Boolean(viewer.session)} />
        }
      />

      <div className="flex flex-col gap-12 px-6 pb-20 pt-10 xl:pl-12 xl:pr-10">
        {seasons.length > 0 && (
          <section>
            <h2 className="mb-3 font-display text-[20px] font-semibold leading-none tracking-[-0.005em] text-text-primary">
              {t("title.episodesHeading")}
            </h2>
            <SeasonAccordion
              seasons={seasons}
              tmdbId={tmdbId}
              tvdbId={title.tvdbId}
              completeness={seasonCompleteness ?? undefined}
            />
          </section>
        )}

        {franchiseTitle && (
          <FranchiseRow
            title={franchiseTitle}
            items={franchiseItems}
            statusMap={franchiseStatusMap}
            requestStatusMap={franchiseRequestStatusMap}
            blockedKeys={blockedKeys}
            favoritedIds={franchiseFavoritedIds}
            showFavorite={Boolean(viewer.session)}
            arrConfigured={viewer.session ? arrConfigured : undefined}
            collectionId={collectionId}
            collectionFavorited={collectionFavorited}
            isAdmin={viewer.session ? viewer.isAdmin : undefined}
            pageTitle={{ mediaType: type, tmdbId }}
            mayRequest={mayRequest}
          />
        )}
        <StudioRow companies={companies} favoritedIds={companyFavoritedIds} showFavorite={Boolean(viewer.session)} />
        <SimilarTitlesRow
          items={similarItems}
          statusMap={similarStatusMap}
          requestStatusMap={similarRequestStatusMap}
          blockedKeys={blockedKeys}
          favoritedIds={similarFavoritedIds}
          showFavorite={Boolean(viewer.session)}
          arrConfigured={viewer.session ? arrConfigured : undefined}
          isAdmin={viewer.session ? viewer.isAdmin : undefined}
          mayRequest={mayRequest}
        />
      </div>
    </div>
  );
}
