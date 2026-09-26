import { withApi } from "@/lib/api/handler";
import { requireApiReviewer } from "@/lib/api/auth";
import { unwrap } from "@/lib/api/guards";
import { invalid, parseUuidSegment, readJsonBody } from "@/lib/api/request";
import { hasOverrides, parseAddOverrides } from "@/lib/arr/add-options";
import { retryRequest } from "@/lib/requests/mutate";
import type { Ok } from "@/lib/api/types";

/** "Retry" on a request under "Couldn't add": adds it again with the
 * Advanced picks it was approved with, or the ones in the body (same fields
 * as approve). */
export const POST = withApi<{ id: string }>(async (request, params): Promise<Ok> => {
  const ctx = await requireApiReviewer(request, "Only an admin can retry requests.");
  const requestId = parseUuidSegment(params.id, "That request isn't waiting to be added any more.");
  const parsed = parseAddOverrides(await readJsonBody(request), "tv");
  if (!parsed.ok) throw invalid(parsed.error);
  unwrap(await retryRequest(requestId, ctx.user.id, hasOverrides(parsed.overrides) ? parsed.overrides : undefined));
  return { ok: true };
});
