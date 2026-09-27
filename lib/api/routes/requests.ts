import { withApi } from "@/lib/api/handler";
import { requireApiAdmin, requireApiPermission } from "@/lib/api/auth";
import { unwrap } from "@/lib/api/guards";
import { msg, type ApiMessage } from "@/lib/api/errors";
import { parseUuidSegment } from "@/lib/api/request";
import type { CoreResult } from "@/lib/core-result";
import type { Ok } from "@/lib/api/types";

/** POST /api/v1/requests/[id]/{approve,manual-approve}. Reject has its own
 * handler (app/api/v1/requests/[id]/reject/route.ts) because it also reads a
 * reason from the body. */
export function reviewRequestHandler(
  review: (requestId: string, adminUserId: string) => Promise<CoreResult>,
  forbiddenMessage: ApiMessage,
  /** Manual approval means the admin adds it by hand, so only the admin may
   * promise that; approving is open to trusted members too. */
  adminOnly = false,
) {
  return withApi<{ id: string }>(async (request, params): Promise<Ok> => {
    const ctx = adminOnly
      ? await requireApiAdmin(request, forbiddenMessage)
      : await requireApiPermission(request, "reviewRequests", forbiddenMessage);
    const requestId = parseUuidSegment(params.id, msg("server.requestNotFoundOrReviewed"));
    unwrap(await review(requestId, ctx.user.id));
    return { ok: true };
  });
}
