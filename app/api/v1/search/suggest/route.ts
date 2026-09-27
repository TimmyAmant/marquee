import { withApi } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/api/auth";
import { requireTmdbConfigured } from "@/lib/api/guards";
import { getSearchSuggestions, wantsCompanies } from "@/lib/search/suggest";
import type { ListResponse, SearchSuggestion } from "@/lib/api/types";

/** Header search type-ahead, grouped in the search page's order: movies,
 * series, people, and (with `?include=company,network`, 0.55+) studios and
 * networks. Queries under two characters return an empty list without
 * calling TMDb. Movies/series carry the viewer's library status (a local
 * lookup, never a live Sonarr/Radarr call). */
export const GET = withApi(async (request): Promise<ListResponse<SearchSuggestion>> => {
  const ctx = await requireApiUser(request);
  const params = new URL(request.url).searchParams;
  const q = params.get("q");
  if ((q?.trim().length ?? 0) < 2) return { results: [] };
  await requireTmdbConfigured();
  return {
    results: await getSearchSuggestions(q, await ctx.libraryOwnerId(), {
      includeCompanies: wantsCompanies(params.get("include")),
    }),
  };
});
