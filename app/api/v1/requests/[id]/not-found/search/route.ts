import { withApi } from "@/lib/api/handler";
import { msg } from "@/lib/api/errors";
import { requireApiPermission } from "@/lib/api/auth";
import { unwrap } from "@/lib/api/guards";
import { parseUuidSegment } from "@/lib/api/request";
import { searchNotFoundAgain } from "@/lib/requests/not-found";
import type { Ok } from "@/lib/api/types";

/** "Search again": the request's Sonarr/Radarr searches for it now (0.46+). */
export const POST = withApi<{ id: string }>(async (request, params): Promise<Ok> => {
  await requireApiPermission(request, "reviewRequests", msg("server.onlyAdminReviewRequests"));
  const requestId = parseUuidSegment(params.id, msg("server.requestNotInCantFind"));
  unwrap(await searchNotFoundAgain(requestId));
  return { ok: true };
});
