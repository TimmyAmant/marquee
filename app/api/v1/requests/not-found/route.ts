import { withApi } from "@/lib/api/handler";
import { requireApiReviewer } from "@/lib/api/auth";
import { notFoundRequest } from "@/lib/api/mappers";
import { getNotFoundAfterHours, getNotFoundRequests } from "@/lib/requests/not-found";
import type { NotFoundRequestsResponse } from "@/lib/api/types";

/** "Can't find": approved requests Sonarr/Radarr hasn't found a release
 * for, longest-missing first (0.46+). */
export const GET = withApi(async (request): Promise<NotFoundRequestsResponse> => {
  await requireApiReviewer(request, "Only an admin can review requests.");
  const [rows, afterHours] = await Promise.all([getNotFoundRequests(), getNotFoundAfterHours()]);
  return { results: rows.map(notFoundRequest), afterHours };
});
