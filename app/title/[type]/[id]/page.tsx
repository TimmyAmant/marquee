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
import { translatorFor } from "@/lib/i18n/catalog";
import { LOCALES } from "@/lib/i18n/locales";
import { localizeRejectionReason } from "@/lib/requests/rejection-reasons";
import { pickTitleLogo } from "@/lib/tmdb/logo";

const allTranslators = LOCALES.map((locale) => translatorFor(locale));

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
    episodeCounts,
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
  // A logo in the reader's language first (the title's translation keeps
  // one when TMDb has it), then English.
  const titleLogo = pickTitleLogo(raw?.images, t.locale.split("-")[0]);

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
        downloadProgress={libraryStatus.downloadProgress ?? null}
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
          }).myRequests.map((r) =>
            // A removed one's reason, a preset in the viewer's language.
            r.removedReason ? { ...r, removedReason: localizeRejectionReason(t, r.removedReason, allTranslators) } : r,
          )
        }
        may={
          viewer.session
            ? {
                request: mayRequest[type],
                advanced: permissions.advancedRequests,
                manageBlocklist: permissions.manageBlocklist,
                // "This request will be approved automatically".
                autoApprove:
                  viewer.isAdmin || (type === "movie" ? permissions.autoApproveMovies : permissions.autoApproveTv),
              }
            : undefined
        }
        file={libraryStatus.file}
        runtimeLabel={runtimeLabel}
        playLinks={viewer.session ? data.playLinks : []}
        arrLinks={viewer.session ? data.arrLinks : []}
        logo={titleLogo ? { path: titleLogo.file_path, aspectRatio: titleLogo.aspect_ratio } : null}
        lead={
          <>
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

            <CastRow cast={cast} favoritedIds={castFavoritedIds} showFavorite={Boolean(viewer.session)} />
          </>
        }
      />

      {/* Every row under the hero spans the same width, between the same
          gutters as the hero's poster and facts card (Episodes and the cast
          are in the hero, beside the facts card). */}
      <div className="flex flex-col gap-12 px-6 pb-20 pt-12 xl:pl-12 xl:pr-10">
        {franchiseTitle && (
          <FranchiseRow
            title={franchiseTitle}
            items={franchiseItems}
            statusMap={franchiseStatusMap}
            episodeCounts={episodeCounts}
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
          episodeCounts={episodeCounts}
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
