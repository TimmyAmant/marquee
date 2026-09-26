import { withApi } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/api/auth";
import { requireTmdbConfigured } from "@/lib/api/guards";
import { parseTitleParams, requireTitle, type TitleParams } from "@/lib/api/routes/titles";
import { libraryInfo, titleViewerState } from "@/lib/api/mappers";
import { loadTitleStatus, tvSeasonsOf } from "@/lib/pages/title";
import type { TitleStatus } from "@/lib/api/types";

/** Just the title page's library/action state — the `library` and `viewer`
 * blocks of the full detail — for refreshing after add/request/monitor. */
export const GET = withApi<TitleParams>(async (request, params): Promise<TitleStatus> => {
  const ctx = await requireApiUser(request);
  const { mediaType, tmdbId } = parseTitleParams(params);
  await requireTmdbConfigured();

  const title = await requireTitle(mediaType, tmdbId);
  const status = await loadTitleStatus(
    await ctx.viewer(),
    mediaType,
    tmdbId,
    title.tvdbId,
    tvSeasonsOf(mediaType, title.rawTmdb),
  );

  return {
    mediaType,
    tmdbId,
    library: libraryInfo(status.libraryStatus),
    viewer: titleViewerState({
      isAdmin: ctx.user.isAdmin,
      status: status.libraryStatus.status,
      configured: status.libraryStatus.configured,
      favorited: Boolean(status.titleFavorited),
      requestStatus: status.activeRequestStatus,
      otherRequesters: status.otherRequesters,
      arrTracking: status.arrTracking,
      seasonRequests: status.seasonRequests,
      fourK: status.fourK,
      openReports: status.openReports,
    }),
  };
});
