import { withApi } from "@/lib/api/handler";
import { requireApiAdmin } from "@/lib/api/auth";
import { requireTmdbConfigured, unwrap } from "@/lib/api/guards";
import { apiJson } from "@/lib/api/errors";
import { readJsonBody } from "@/lib/api/request";
import { DISCOVER_SETTINGS_FORBIDDEN, discoverShelfSettingDto } from "@/lib/api/routes/discover-settings";
import { createCustomShelf } from "@/lib/discover/layout";

/** Adds one of the admin's own rows at the end of Discover: `{ kind,
 * title?, mediaType?, tmdbId?, name?, url? }` (docs/api-v1.md). */
export const POST = withApi(async (request): Promise<Response> => {
  await requireApiAdmin(request, DISCOVER_SETTINGS_FORBIDDEN);
  const body = await readJsonBody(request);
  // Every kind but "library" is read from TMDb (Trakt rows for the posters).
  if (body.kind !== "library") await requireTmdbConfigured();
  const { shelf } = unwrap(await createCustomShelf(body));
  return apiJson(discoverShelfSettingDto(shelf), { status: 201 });
});
