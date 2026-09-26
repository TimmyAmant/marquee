import { withApi } from "@/lib/api/handler";
import { requireApiReviewer } from "@/lib/api/auth";
import { unwrap } from "@/lib/api/guards";
import { optionalString, parseUuidSegment, readJsonBody } from "@/lib/api/request";
import { normalizeRejectionReason } from "@/lib/requests/rejection-reasons";
import { rejectRequest } from "@/lib/requests/mutate";
import type { Ok } from "@/lib/api/types";

/** Reject: declines the request and notifies the requester. Unlike approve
 * and manual-approve (which share reviewRequestHandler) this reads an
 * optional JSON body, `{ "reason": "..." }`: the text of one of the presets
 * GET /requests/pending lists, or the admin's own words. Clients send the
 * text itself, not a preset id, and the server only normalizes it (whitespace,
 * 200 character cap) rather than rejecting long or unlisted input, so an
 * older client that sends no body at all still works. */
export const POST = withApi<{ id: string }>(async (request, params): Promise<Ok> => {
  const ctx = await requireApiReviewer(request, "Only an admin can reject requests.");
  const requestId = parseUuidSegment(params.id, "Request not found or already reviewed.");
  const body = await readJsonBody(request);
  const reason = normalizeRejectionReason(optionalString(body, "reason"));
  unwrap(await rejectRequest(requestId, ctx.user.id, reason));
  return { ok: true };
});
