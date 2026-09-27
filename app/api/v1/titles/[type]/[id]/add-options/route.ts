import { withApi } from "@/lib/api/handler";
import { ApiError, msg } from "@/lib/api/errors";
import { requireApiPermission } from "@/lib/api/auth";
import { queryBool } from "@/lib/api/request";
import { parseTitleParams, type TitleParams } from "@/lib/api/routes/titles";
import { getAddOptions, type AddOptions } from "@/lib/arr/add-options-server";
import { getAdminUserId } from "@/lib/auth/get-admin";

/** What the "Advanced" section of Approve / Add offers for this title: each
 * Sonarr (TV) or Radarr (movie) server of the asked-for 4K-ness, with its
 * pickers and the values it would use unchanged. For whoever may use
 * Advanced request options (lib/users/permissions.ts) — when asking for a
 * title or approving one — always with the admin's servers. */
export const GET = withApi<TitleParams>(async (request, params): Promise<AddOptions> => {
  const ctx = await requireApiPermission(request, "advancedRequests", msg("server.onlyAdminApproveRequests"));
  const { mediaType, tmdbId } = parseTitleParams(params);
  const fourK = queryBool(new URL(request.url), "is4k") ?? false;
  const ownerId = ctx.user.isAdmin ? ctx.user.id : await getAdminUserId();
  if (!ownerId) throw ApiError.of("conflict", msg("server.noAdminToAddWith"));
  return getAddOptions(ownerId, mediaType, tmdbId, fourK);
});
