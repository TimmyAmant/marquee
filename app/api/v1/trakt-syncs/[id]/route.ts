import { withApi } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/api/auth";
import { unwrap } from "@/lib/api/guards";
import { parseUuidSegment, readJsonBody } from "@/lib/api/request";
import { deleteTraktSync, updateTraktSync } from "@/lib/trakt/sync";
import type { Ok, TraktSync } from "@/lib/api/types";

const NOT_FOUND = "That Trakt sync doesn't exist any more.";

/** Which kinds it requests: `{ movies?, tv? }`. Your own (the admin: anyone's). */
export const PATCH = withApi<{ id: string }>(async (request, params): Promise<TraktSync> => {
  const ctx = await requireApiUser(request);
  const id = parseUuidSegment(params.id, NOT_FOUND);
  const body = await readJsonBody(request);
  const { sync } = unwrap(await updateTraktSync(ctx.user, id, body));
  return sync;
});

/** Stops syncing that list. Your own (the admin: anyone's). */
export const DELETE = withApi<{ id: string }>(async (request, params): Promise<Ok> => {
  const ctx = await requireApiUser(request);
  const id = parseUuidSegment(params.id, NOT_FOUND);
  unwrap(await deleteTraktSync(ctx.user, id));
  return { ok: true };
});
