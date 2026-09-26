import { withApi } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/api/auth";
import { issueDto } from "@/lib/api/mappers";
import { issueKindLabel, listIssues } from "@/lib/issues";
import { getT } from "@/lib/i18n/server";
import { issueKindValues } from "@/lib/db/schema";
import { can } from "@/lib/users/permissions";
import { countComments } from "@/lib/comments";
import type { IssuesResponse } from "@/lib/api/types";

/** Problem reports: the admin gets every open one plus the 30 most recently
 * fixed; a member only their own (up to 100), newest first. */
export const GET = withApi(async (request): Promise<IssuesResponse> => {
  const ctx = await requireApiUser(request);
  const rows = await listIssues({ userId: ctx.user.id, managesIssues: can(ctx.user, "manageIssues") });
  const comments = await countComments("issue", rows.map((r) => r.id));
  const t = await getT();
  return {
    results: rows.map((row) => issueDto(t, row, ctx.user.id, comments.get(row.id) ?? 0)),
    kinds: issueKindValues.map((id) => ({ id, label: issueKindLabel(t, id) })),
  };
});
