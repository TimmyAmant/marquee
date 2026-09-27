import { withApi } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/api/auth";
import { requireTmdbConfigured } from "@/lib/api/guards";
import { ApiError, msg } from "@/lib/api/errors";
import { queryInt } from "@/lib/api/request";
import { titleCard } from "@/lib/api/mappers";
import { DISCOVER_LISTS } from "@/lib/discover/lists";
import { fetchResolvedListPage, resolveDiscoverList } from "@/lib/pages/discover-lists";
import type { DiscoverListResults } from "@/lib/api/types";

/** A Discover shelf's full list ("See all" on Recently Added, Trending, the
 * Upcoming shelves, and each row the admin added — by its id), paged, with
 * status, favorited and canQuickAdd. */
export const GET = withApi<{ list: string }>(async (request, params): Promise<DiscoverListResults> => {
  const ctx = await requireApiUser(request);
  const resolved = await resolveDiscoverList(params.list);
  if (!resolved) {
    throw ApiError.of("not_found", msg("server.noDiscoverList", { list: params.list, lists: DISCOVER_LISTS.join(", ") }));
  }
  const page = queryInt(new URL(request.url), "page", { min: 1, max: resolved.maxPage }) ?? 1;
  // Recently Added comes from the library, not TMDb.
  const fromLibrary =
    (resolved.type === "builtIn" && (resolved.list === "recently-added" || resolved.list === "watchlist")) ||
    (resolved.type === "custom" && resolved.shelf.kind === "library");
  if (!fromLibrary) await requireTmdbConfigured();

  const result = await fetchResolvedListPage(resolved, page, await ctx.viewer());
  return {
    list: result.list,
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
