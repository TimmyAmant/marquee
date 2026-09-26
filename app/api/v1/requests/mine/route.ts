import { withApi } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/api/auth";
import { myRequest } from "@/lib/api/mappers";
import { getMyRequests } from "@/lib/requests/query";
import { countComments } from "@/lib/comments";
import type { ListResponse, MyRequest } from "@/lib/api/types";

/** The caller's own requests, newest first — what a member's Requests page
 * lists. Approved ones carry live library status and the page's label
 * ("In your library", "Downloading", …). */
export const GET = withApi(async (request): Promise<ListResponse<MyRequest>> => {
  const ctx = await requireApiUser(request);
  const rows = await getMyRequests(ctx.user.id, await ctx.libraryOwnerId());
  const comments = await countComments("request", rows.map((r) => r.id));
  return { results: rows.map((row) => myRequest(row, comments.get(row.id) ?? 0)) };
});
