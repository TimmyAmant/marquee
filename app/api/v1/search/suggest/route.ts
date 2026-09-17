import { withApi } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/api/auth";
import { requireTmdbConfigured } from "@/lib/api/guards";
import { getSearchSuggestions } from "@/lib/search/suggest";
import type { ListResponse, SearchSuggestion } from "@/lib/api/types";

/** Header search type-ahead: up to 7 people/movies/series. Queries under two
 * characters return an empty list without calling TMDb. */
export const GET = withApi(async (request): Promise<ListResponse<SearchSuggestion>> => {
  await requireApiUser(request);
  const q = new URL(request.url).searchParams.get("q");
  if ((q?.trim().length ?? 0) < 2) return { results: [] };
  await requireTmdbConfigured();
  return { results: await getSearchSuggestions(q) };
});
