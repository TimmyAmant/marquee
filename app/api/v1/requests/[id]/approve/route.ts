import { withApi } from "@/lib/api/handler";
import { requireApiPermission } from "@/lib/api/auth";
import { unwrap } from "@/lib/api/guards";
import { invalid, parseUuidSegment, readJsonBody } from "@/lib/api/request";
import { hasOverrides, parseAddOverrides } from "@/lib/arr/add-options";
import { ADVANCED_REFUSED } from "@/lib/requests/access";
import { can } from "@/lib/users/permissions";
import { ApiError, msg } from "@/lib/api/errors";
import { approveRequest } from "@/lib/requests/mutate";
import type { Ok } from "@/lib/api/types";

/** Approve: adds the title with the admin's Sonarr/Radarr, then notifies the
 * requester. An optional body picks the server, quality profile, root
 * folder, tags and (TV) series type — the website's "Advanced" section, for
 * whoever also has advancedRequests;
 * no body is the server's defaults, as it always was. */
export const POST = withApi<{ id: string }>(async (request, params): Promise<Ok> => {
  const ctx = await requireApiPermission(request, "reviewRequests", msg("server.onlyAdminApproveRequests"));
  const requestId = parseUuidSegment(params.id, msg("server.requestNotFoundOrReviewed"));
  // Series type is checked as if for a show; a movie simply ignores it.
  const parsed = parseAddOverrides(await readJsonBody(request), "tv");
  if (!parsed.ok) throw invalid(parsed.error);
  // Advanced picks take the advancedRequests permission as well.
  if (hasOverrides(parsed.overrides) && !can(ctx.user, "advancedRequests")) throw ApiError.of("forbidden", msg(ADVANCED_REFUSED));
  unwrap(await approveRequest(requestId, ctx.user.id, parsed.overrides));
  return { ok: true };
});
