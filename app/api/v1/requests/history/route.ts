import { withApi } from "@/lib/api/handler";
import { requireApiAdmin } from "@/lib/api/auth";
import { reviewedRequest } from "@/lib/api/mappers";
import { getReviewedRequests } from "@/lib/requests/query";
import type { ListResponse, ReviewedRequest } from "@/lib/api/types";

/** "Past requests": the 50 most recently reviewed requests. */
export const GET = withApi(async (request): Promise<ListResponse<ReviewedRequest>> => {
  await requireApiAdmin(request, "Only an admin can review requests.");
  const rows = await getReviewedRequests();
  return { results: rows.map(reviewedRequest) };
});
