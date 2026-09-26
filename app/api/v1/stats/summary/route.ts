import { withApi } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/api/auth";
import { getPendingRequestCount } from "@/lib/requests/query";
import { getOpenIssueCount } from "@/lib/issues";
import { getNotFoundCount } from "@/lib/requests/not-found";
import { getUserLibrary, summarizeLibrary } from "@/lib/library/query";
import { canReviewRequests } from "@/lib/users/roles";
import type { StatsSummary } from "@/lib/api/types";

/** A handful of counts for dashboard widgets (Homepage's customapi, Homarr)
 * — docs/integrations.md. A read-only API key is enough. The review counts
 * are 0 for an account that doesn't review requests, as on /badges. */
export const GET = withApi(async (request): Promise<StatsSummary> => {
  const ctx = await requireApiUser(request);
  const reviews = canReviewRequests(ctx.user.role);
  const [pendingRequests, openIssues, cantFind, library] = await Promise.all([
    reviews ? getPendingRequestCount() : Promise.resolve(0),
    reviews ? getOpenIssueCount() : Promise.resolve(0),
    reviews ? getNotFoundCount() : Promise.resolve(0),
    getUserLibrary(await ctx.libraryOwnerId()),
  ]);
  const summary = summarizeLibrary(library);
  return {
    pendingRequests,
    openIssues,
    cantFind,
    movies: summary.movieCount,
    series: summary.tvCount,
    downloading: library.filter((item) => item.status === "tracked_downloading").length,
  };
});
