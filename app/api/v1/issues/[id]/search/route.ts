import { withApi } from "@/lib/api/handler";
import { msg } from "@/lib/api/errors";
import { requireApiPermission } from "@/lib/api/auth";
import { unwrap } from "@/lib/api/guards";
import { parseUuidSegment } from "@/lib/api/request";
import { searchAgainForIssue } from "@/lib/issues";
import type { Ok } from "@/lib/api/types";

/** "Search again": has Radarr/Sonarr look for another copy of the title. */
export const POST = withApi<{ id: string }>(async (request, params): Promise<Ok> => {
  const ctx = await requireApiPermission(request, "manageIssues", msg("server.onlyAdminSearchTitles"));
  const id = parseUuidSegment(params.id, msg("server.reportNotFound"));
  unwrap(await searchAgainForIssue(ctx.user.id, id));
  return { ok: true };
});
