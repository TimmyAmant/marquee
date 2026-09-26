import { withApi } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/api/auth";
import { attentionCounts } from "@/lib/requests/access";
import { getUserLibrary, summarizeLibrary } from "@/lib/library/query";
import type { StatsSummary } from "@/lib/api/types";

/** A handful of counts for dashboard widgets (Homepage's customapi, Homarr)
 * — docs/integrations.md. A read-only API key is enough. Each review count
 * is 0 unless the account may act on it, as on /badges. */
export const GET = withApi(async (request): Promise<StatsSummary> => {
  const ctx = await requireApiUser(request);
  const [counts, library] = await Promise.all([attentionCounts(ctx.user), getUserLibrary(await ctx.libraryOwnerId())]);
  const { pendingRequests, openIssues, notFoundRequests: cantFind } = counts;
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
