import { withApi } from "@/lib/api/handler";
import { requireApiPermission } from "@/lib/api/auth";
import { unwrap } from "@/lib/api/guards";
import { parseUuidSegment } from "@/lib/api/request";
import { searchAgainForIssue } from "@/lib/issues";
import type { Ok } from "@/lib/api/types";

/** "Search again": has Radarr/Sonarr look for another copy of the title. */
export const POST = withApi<{ id: string }>(async (request, params): Promise<Ok> => {
  const ctx = await requireApiPermission(request, "manageIssues", "Only the admin can search for titles.");
  const id = parseUuidSegment(params.id, "Report not found.");
  unwrap(await searchAgainForIssue(ctx.user.id, id));
  return { ok: true };
});
