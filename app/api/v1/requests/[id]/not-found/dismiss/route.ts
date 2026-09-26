import { withApi } from "@/lib/api/handler";
import { requireApiReviewer } from "@/lib/api/auth";
import { unwrap } from "@/lib/api/guards";
import { parseUuidSegment } from "@/lib/api/request";
import { dismissNotFound } from "@/lib/requests/not-found";
import type { Ok } from "@/lib/api/types";

/** "Mark as found": takes the request off "Can't find" for good (0.46+). */
export const POST = withApi<{ id: string }>(async (request, params): Promise<Ok> => {
  await requireApiReviewer(request, "Only an admin can review requests.");
  const requestId = parseUuidSegment(params.id, "That request isn't in Can't find any more.");
  unwrap(await dismissNotFound(requestId));
  return { ok: true };
});
