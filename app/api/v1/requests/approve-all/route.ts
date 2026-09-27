import { withApi } from "@/lib/api/handler";
import { requireApiPermission } from "@/lib/api/auth";
import { ApiError, msg } from "@/lib/api/errors";
import { approveAllRequests } from "@/lib/requests/mutate";
import { getT } from "@/lib/i18n/server";
import type { ApproveAllResponse } from "@/lib/api/types";

/** "Approve all": approves every pending request one at a time. Failures stay
 * pending. If there were pending requests and none could be approved, the
 * first failure is returned as the error; partial success is a 200 with a
 * summary message. */
export const POST = withApi(async (request): Promise<ApproveAllResponse> => {
  const ctx = await requireApiPermission(request, "reviewRequests", msg("server.onlyAdminApproveRequests"));
  const { approvedCount, failedCount, firstFailure } = await approveAllRequests(ctx.user.id);

  if (approvedCount === 0 && firstFailure) {
    throw ApiError.fromFailure(firstFailure);
  }
  return {
    ok: true,
    approvedCount,
    failedCount,
    message: failedCount > 0 ? (await getT())("server.someNotApproved", { count: failedCount }) : null,
  };
});
