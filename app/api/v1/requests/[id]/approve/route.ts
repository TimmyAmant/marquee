import { withApi } from "@/lib/api/handler";
import { requireApiReviewer } from "@/lib/api/auth";
import { unwrap } from "@/lib/api/guards";
import { invalid, parseUuidSegment, readJsonBody } from "@/lib/api/request";
import { parseAddOverrides } from "@/lib/arr/add-options";
import { approveRequest } from "@/lib/requests/mutate";
import type { Ok } from "@/lib/api/types";

/** Approve: adds the title with the admin's Sonarr/Radarr, then notifies the
 * requester. An optional body picks the server, quality profile, root
 * folder, tags and (TV) series type — the website's "Advanced" section;
 * no body is the server's defaults, as it always was. */
export const POST = withApi<{ id: string }>(async (request, params): Promise<Ok> => {
  const ctx = await requireApiReviewer(request, "Only an admin can approve requests.");
  const requestId = parseUuidSegment(params.id, "Request not found or already reviewed.");
  // Series type is checked as if for a show; a movie simply ignores it.
  const parsed = parseAddOverrides(await readJsonBody(request), "tv");
  if (!parsed.ok) throw invalid(parsed.error);
  unwrap(await approveRequest(requestId, ctx.user.id, parsed.overrides));
  return { ok: true };
});
