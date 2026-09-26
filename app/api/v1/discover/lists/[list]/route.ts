import { withApi } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/api/auth";
import { requireTmdbConfigured } from "@/lib/api/guards";
import { ApiError } from "@/lib/api/errors";
import { queryInt } from "@/lib/api/request";
import { titleCard } from "@/lib/api/mappers";
import { DISCOVER_LISTS, discoverListMaxPage, parseDiscoverList } from "@/lib/discover/lists";
import { fetchDiscoverListPage } from "@/lib/pages/discover-lists";
import type { DiscoverListResults } from "@/lib/api/types";

/** A Discover shelf's full list ("See all" on Recently Added, Trending and
 * the Upcoming shelves), paged, with status, favorited and canQuickAdd. */
export const GET = withApi<{ list: string }>(async (request, params): Promise<DiscoverListResults> => {
  const ctx = await requireApiUser(request);
  const list = parseDiscoverList(params.list);
  if (!list) throw ApiError.of("not_found", `No Discover list "${params.list}" (one of ${DISCOVER_LISTS.join(", ")}).`);
  const page = queryInt(new URL(request.url), "page", { min: 1, max: discoverListMaxPage(list) }) ?? 1;
  // Recently Added comes from the library, not TMDb.
  if (list !== "recently-added") await requireTmdbConfigured();

  const result = await fetchDiscoverListPage(list, page, await ctx.viewer());
  return {
    list,
    title: result.title,
    page,
    totalPages: result.totalPages,
    totalResults: result.totalResults,
    results: result.items.map((item) =>
      titleCard(item, {
        status: item.status ?? null,
        favorited: item.favorited,
        canQuickAdd: item.canQuickAdd,
      }),
    ),
  };
});
