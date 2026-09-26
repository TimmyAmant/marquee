import { withApi } from "@/lib/api/handler";
import { msg } from "@/lib/api/errors";
import { getT } from "@/lib/i18n/server";
import { requireApiPermission } from "@/lib/api/auth";
import { reviewedRequest } from "@/lib/api/mappers";
import { getReviewedRequests } from "@/lib/requests/query";
import { countComments } from "@/lib/comments";
import type { ListResponse, ReviewedRequest } from "@/lib/api/types";

/** "Past requests": every request under "Couldn't add" (first), then the 50
 * most recently reviewed. */
export const GET = withApi(async (request): Promise<ListResponse<ReviewedRequest>> => {
  await requireApiPermission(request, "viewRequests", msg("server.onlyAdminReviewRequests"));
  const rows = await getReviewedRequests();
  const comments = await countComments("request", rows.map((r) => r.id));
  const t = await getT();
  return { results: rows.map((row) => reviewedRequest(t, row, comments.get(row.id) ?? 0)) };
});
