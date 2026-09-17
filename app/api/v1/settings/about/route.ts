import { withApi } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/api/auth";
import { loadAboutPage, REPO_URL } from "@/lib/pages/settings";
import type { AboutInfo } from "@/lib/api/types";

/** Settings → About: server version, the household library's counts, total
 * requests, the server's time zone, and support links. */
export const GET = withApi(async (request): Promise<AboutInfo> => {
  const ctx = await requireApiUser(request);
  const { version, summary, totalRequests, timeZone } = await loadAboutPage(await ctx.viewer());
  return {
    version,
    movieCount: summary.movieCount,
    tvCount: summary.tvCount,
    trackedCount: summary.trackedCount,
    totalRequests,
    timeZone,
    repoUrl: REPO_URL,
    issuesUrl: `${REPO_URL}/issues`,
  };
});
