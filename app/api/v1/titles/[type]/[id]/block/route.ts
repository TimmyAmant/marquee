import { withApi } from "@/lib/api/handler";
import { requireApiAdmin } from "@/lib/api/auth";
import { unwrap } from "@/lib/api/guards";
import { readJsonBody } from "@/lib/api/request";
import { parseTitleParams, type TitleParams } from "@/lib/api/routes/titles";
import { blockTitle, unblockTitle } from "@/lib/requests/blocklist";
import type { Ok } from "@/lib/api/types";

const FORBIDDEN = "Only the admin can manage the blocklist.";

/** "Block requests" for this title. Body (optional): `{ "reason": "…" }`,
 * shown to whoever tries to request it. */
export const POST = withApi<TitleParams>(async (request, params): Promise<Ok> => {
  await requireApiAdmin(request, FORBIDDEN);
  const { mediaType, tmdbId } = parseTitleParams(params);
  const body = await readJsonBody(request);
  unwrap(await blockTitle(mediaType, tmdbId, body.reason));
  return { ok: true };
});

/** "Unblock requests". */
export const DELETE = withApi<TitleParams>(async (request, params): Promise<Ok> => {
  await requireApiAdmin(request, FORBIDDEN);
  const { mediaType, tmdbId } = parseTitleParams(params);
  unwrap(await unblockTitle(mediaType, tmdbId));
  return { ok: true };
});
