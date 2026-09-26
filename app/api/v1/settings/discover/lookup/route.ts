import { withApi } from "@/lib/api/handler";
import { requireApiAdmin } from "@/lib/api/auth";
import { requireTmdbConfigured, unwrap } from "@/lib/api/guards";
import { DISCOVER_SETTINGS_FORBIDDEN } from "@/lib/api/routes/discover-settings";
import { lookUpShelfSource } from "@/lib/discover/lookup";
import type { DiscoverLookupResult, ListResponse } from "@/lib/api/types";

/** Finds what to build a row from: `?type=keyword|company|network|genre
 * &q=…` (genres also `&mediaType=movie|tv`). */
export const GET = withApi(async (request): Promise<ListResponse<DiscoverLookupResult>> => {
  await requireApiAdmin(request, DISCOVER_SETTINGS_FORBIDDEN);
  await requireTmdbConfigured();
  const url = new URL(request.url);
  const { results } = unwrap(
    await lookUpShelfSource(url.searchParams.get("type") ?? "", url.searchParams.get("q") ?? "", url.searchParams.get("mediaType")),
  );
  return { results };
});
