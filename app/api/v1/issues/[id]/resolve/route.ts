import { withApi } from "@/lib/api/handler";
import { msg } from "@/lib/api/errors";
import { requireApiPermission } from "@/lib/api/auth";
import { unwrap } from "@/lib/api/guards";
import { parseUuidSegment, readJsonBody } from "@/lib/api/request";
import { resolveIssue } from "@/lib/issues";
import type { Ok } from "@/lib/api/types";

/** Marks a report fixed. Body (optional): `{ "note": "Replaced the file" }`,
 * shown to whoever reported it. */
export const POST = withApi<{ id: string }>(async (request, params): Promise<Ok> => {
  const ctx = await requireApiPermission(request, "manageIssues", msg("server.onlyAdminResolveReports"));
  const id = parseUuidSegment(params.id, msg("server.reportNotOpen"));
  const body = await readJsonBody(request);
  unwrap(await resolveIssue(ctx.user.id, id, body.note));
  return { ok: true };
});
