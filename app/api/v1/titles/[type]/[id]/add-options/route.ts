import { withApi } from "@/lib/api/handler";
import { requireApiPermission } from "@/lib/api/auth";
import { unwrap } from "@/lib/api/guards";
import { queryBool } from "@/lib/api/request";
import { parseTitleParams, type TitleParams } from "@/lib/api/routes/titles";
import { getAddOptions, type AddOptions } from "@/lib/arr/add-options-server";
import { getAdminUserId } from "@/lib/auth/get-admin";
import { fail } from "@/lib/core-result";

/** What the "Advanced" section of Approve / Add offers for this title: each
 * Sonarr (TV) or Radarr (movie) server of the asked-for 4K-ness, with its
 * pickers and the values it would use unchanged. For whoever may use
 * Advanced request options (lib/users/permissions.ts) — when asking for a
 * title or approving one — always with the admin's servers. */
export const GET = withApi<TitleParams>(async (request, params): Promise<AddOptions> => {
  const ctx = await requireApiPermission(request, "advancedRequests", "Only an admin can approve requests.");
  const { mediaType, tmdbId } = parseTitleParams(params);
  const fourK = queryBool(new URL(request.url), "is4k") ?? false;
  const ownerId = ctx.user.isAdmin ? ctx.user.id : await getAdminUserId();
  if (!ownerId) unwrap(fail("conflict", "There's no admin account to add titles with."));
  return getAddOptions(ownerId!, mediaType, tmdbId, fourK);
});
