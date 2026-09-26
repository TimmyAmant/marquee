import { withApi } from "@/lib/api/handler";
import { requireApiReviewer } from "@/lib/api/auth";
import { unwrap } from "@/lib/api/guards";
import { parseUuidSegment, readJsonBody } from "@/lib/api/request";
import { resolveIssue } from "@/lib/issues";
import type { Ok } from "@/lib/api/types";

/** Marks a report fixed. Body (optional): `{ "note": "Replaced the file" }`,
 * shown to whoever reported it. */
export const POST = withApi<{ id: string }>(async (request, params): Promise<Ok> => {
  const ctx = await requireApiReviewer(request, "Only the admin can resolve problem reports.");
  const id = parseUuidSegment(params.id, "That report isn't open any more.");
  const body = await readJsonBody(request);
  unwrap(await resolveIssue(ctx.user.id, id, body.note));
  return { ok: true };
});
