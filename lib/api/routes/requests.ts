import { withApi } from "@/lib/api/handler";
import { requireApiAdmin } from "@/lib/api/auth";
import { unwrap } from "@/lib/api/guards";
import { parseUuidSegment } from "@/lib/api/request";
import type { CoreResult } from "@/lib/core-result";
import type { Ok } from "@/lib/api/types";

/** POST /api/v1/requests/[id]/{approve,manual-approve}. Reject has its own
 * handler (app/api/v1/requests/[id]/reject/route.ts) because it also reads a
 * reason from the body. */
export function reviewRequestHandler(
  review: (requestId: string, adminUserId: string) => Promise<CoreResult>,
  forbiddenMessage: string,
) {
  return withApi<{ id: string }>(async (request, params): Promise<Ok> => {
    const ctx = await requireApiAdmin(request, forbiddenMessage);
    const requestId = parseUuidSegment(params.id, "Request not found or already reviewed.");
    unwrap(await review(requestId, ctx.user.id));
    return { ok: true };
  });
}
