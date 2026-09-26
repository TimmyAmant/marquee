import { withApi } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/api/auth";
import { unwrap } from "@/lib/api/guards";
import { parseUuidSegment } from "@/lib/api/request";
import { deleteIssue } from "@/lib/issues";
import { canReviewRequests } from "@/lib/users/roles";
import type { Ok } from "@/lib/api/types";

/** Withdraws a report: your own while it's open, or (admin) any. */
export const DELETE = withApi<{ id: string }>(async (request, params): Promise<Ok> => {
  const ctx = await requireApiUser(request);
  const id = parseUuidSegment(params.id, "Report not found.");
  unwrap(await deleteIssue({ userId: ctx.user.id, isAdmin: canReviewRequests(ctx.user.role) }, id));
  return { ok: true };
});
