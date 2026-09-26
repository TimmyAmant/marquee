import { withApi } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/api/auth";
import { issueDto } from "@/lib/api/mappers";
import { ISSUE_KIND_LABELS, listIssues } from "@/lib/issues";
import { issueKindValues } from "@/lib/db/schema";
import { canReviewRequests } from "@/lib/users/roles";
import type { IssuesResponse } from "@/lib/api/types";

/** Problem reports: the admin gets every open one plus the 30 most recently
 * fixed; a member only their own (up to 100), newest first. */
export const GET = withApi(async (request): Promise<IssuesResponse> => {
  const ctx = await requireApiUser(request);
  const rows = await listIssues({ userId: ctx.user.id, isAdmin: canReviewRequests(ctx.user.role) });
  return {
    results: rows.map((row) => issueDto(row, ctx.user.id)),
    kinds: issueKindValues.map((id) => ({ id, label: ISSUE_KIND_LABELS[id] })),
  };
});
