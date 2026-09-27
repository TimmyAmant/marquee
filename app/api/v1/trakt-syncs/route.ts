import { withApi } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/api/auth";
import { ApiError, apiJson, msg } from "@/lib/api/errors";
import { unwrap } from "@/lib/api/guards";
import { queryBool, readJsonBody } from "@/lib/api/request";
import { getTraktClientId } from "@/lib/integrations/app-settings";
import { createTraktSync, listTraktSyncs, MAX_SYNCS_PER_MEMBER } from "@/lib/trakt/sync";
import type { TraktSyncs } from "@/lib/api/types";

/** Your Trakt lists kept in sync; `?all=true` is everyone's (the admin only). */
export const GET = withApi(async (request): Promise<TraktSyncs> => {
  const ctx = await requireApiUser(request);
  const all = queryBool(new URL(request.url), "all") ?? false;
  if (all && !ctx.user.isAdmin) throw ApiError.of("forbidden", msg("server.onlyAdminTraktSyncsAll"));
  const [results, clientId] = await Promise.all([
    listTraktSyncs(all ? "all" : { userId: ctx.user.id }),
    getTraktClientId().catch(() => null),
  ]);
  return { results, available: Boolean(clientId), maxPerMember: MAX_SYNCS_PER_MEMBER };
});

/** Starts keeping a public Trakt list or watchlist in sync: `{ url, movies?,
 * tv?, requestExisting? }`. With requestExisting, the first check (which
 * requests what's on it now) runs in the background. */
export const POST = withApi(async (request): Promise<Response> => {
  const ctx = await requireApiUser(request);
  const body = await readJsonBody(request);
  const { sync } = unwrap(await createTraktSync(ctx.user, body));
  return apiJson(sync, { status: 201 });
});
