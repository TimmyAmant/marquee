import { withApi } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/api/auth";
import { requireTmdbConfigured, unwrap } from "@/lib/api/guards";
import { parseTitleParams, requireTitle, type TitleParams } from "@/lib/api/routes/titles";
import { requestAllMissing } from "@/lib/requests/request-all";
import type { RequestAllMissingResult } from "@/lib/api/types";

/** A franchise row's "Request all N missing" (household members; the admin
 * gets 403 and uses Add all). No body: the server works out the set from
 * this title's collection or crossover group — the same titles the detail's
 * `franchise.requestAllMissing` lists — and files each through the normal
 * request path, so request limits and the blocklist can refuse some. A
 * partial result is still 200; `message` says what happened. */
export const POST = withApi<TitleParams>(async (request, params): Promise<RequestAllMissingResult> => {
  const ctx = await requireApiUser(request);
  const { mediaType, tmdbId } = parseTitleParams(params);
  await requireTmdbConfigured();
  await requireTitle(mediaType, tmdbId);

  const { total, requested, refused, message } = unwrap(await requestAllMissing(await ctx.viewer(), mediaType, tmdbId));
  return {
    ok: true,
    total,
    requested,
    refused: refused.map((r) => ({ mediaType: r.mediaType, tmdbId: r.tmdbId, title: r.title, error: r.error })),
    message,
  };
});
