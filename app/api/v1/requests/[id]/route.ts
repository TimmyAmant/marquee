import { withApi } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/api/auth";
import { unwrap } from "@/lib/api/guards";
import { parseUuidSegment, readJsonBody } from "@/lib/api/request";
import { cancelRequest, editRequest } from "@/lib/requests/mutate";
import type { Ok } from "@/lib/api/types";

/** Changes a request still waiting for review: `{ "seasons": [1, 2] }`
 * (TV; null = the whole series) and/or `{ "is4k": true }`. Your own, or
 * (reviewers) anyone's. */
export const PATCH = withApi<{ id: string }>(async (request, params): Promise<Ok> => {
  const ctx = await requireApiUser(request);
  const id = parseUuidSegment(params.id, "Request not found.");
  const body = await readJsonBody(request);
  unwrap(
    await editRequest({ userId: ctx.user.id, role: ctx.user.role }, id, {
      // Absent leaves them as they are; null seasons is the whole series.
      seasons: "seasons" in body ? body.seasons : undefined,
      is4k: "is4k" in body ? body.is4k : undefined,
    }),
  );
  return { ok: true };
});

/** Cancels your own request while it's still waiting for review. */
export const DELETE = withApi<{ id: string }>(async (request, params): Promise<Ok> => {
  const ctx = await requireApiUser(request);
  const id = parseUuidSegment(params.id, "Request not found.");
  unwrap(await cancelRequest({ userId: ctx.user.id, role: ctx.user.role }, id));
  return { ok: true };
});
