import { withApi } from "@/lib/api/handler";
import { msg } from "@/lib/api/errors";
import { getT } from "@/lib/i18n/server";
import { requireApiPermission } from "@/lib/api/auth";
import { notFoundRequest } from "@/lib/api/mappers";
import { getNotFoundAfterHours, getNotFoundRequests } from "@/lib/requests/not-found";
import type { NotFoundRequestsResponse } from "@/lib/api/types";

/** "Can't find": approved requests Sonarr/Radarr hasn't found a release
 * for, longest-missing first (0.46+). */
export const GET = withApi(async (request): Promise<NotFoundRequestsResponse> => {
  await requireApiPermission(request, "reviewRequests", msg("server.onlyAdminReviewRequests"));
  const [rows, afterHours] = await Promise.all([getNotFoundRequests(), getNotFoundAfterHours()]);
  const t = await getT();
  return { results: rows.map((row) => notFoundRequest(t, row)), afterHours };
});
