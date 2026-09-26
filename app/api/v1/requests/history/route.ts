import { withApi } from "@/lib/api/handler";
import { requireApiReviewer } from "@/lib/api/auth";
import { reviewedRequest } from "@/lib/api/mappers";
import { getReviewedRequests } from "@/lib/requests/query";
import { countComments } from "@/lib/comments";
import type { ListResponse, ReviewedRequest } from "@/lib/api/types";

/** "Past requests": every request under "Couldn't add" (first), then the 50
 * most recently reviewed. */
export const GET = withApi(async (request): Promise<ListResponse<ReviewedRequest>> => {
  await requireApiReviewer(request, "Only an admin can review requests.");
  const rows = await getReviewedRequests();
  const comments = await countComments("request", rows.map((r) => r.id));
  return { results: rows.map((row) => reviewedRequest(row, comments.get(row.id) ?? 0)) };
});
