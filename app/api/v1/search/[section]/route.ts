import { withApi } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/api/auth";
import { requireTmdbConfigured } from "@/lib/api/guards";
import { ApiError, msg } from "@/lib/api/errors";
import { invalid, queryInt } from "@/lib/api/request";
import { loadPosterActionRules } from "@/lib/api/poster-action-rules";
import { searchCompanyDto, searchPersonDto, searchTitleDto } from "@/lib/api/search-dto";
import { loadSearchSection } from "@/lib/pages/search";
import { TMDB_MAX_PAGE } from "@/lib/discover/paging";
import type { SearchSectionPage } from "@/lib/api/types";

/** The API's section names, in the search page's order. */
const SEARCH_SECTIONS = { movies: "movie", series: "tv", people: "person", studios: "company" } as const;

/** A search section's "See all" (0.55+): one page of `movies`, `series`,
 * `people` or `studios` (studios and networks; networks only on page 1).
 * Page 1 is the section on GET /search, ranked the same way. */
export const GET = withApi<{ section: string }>(async (request, params): Promise<SearchSectionPage> => {
  const ctx = await requireApiUser(request);
  const kind = SEARCH_SECTIONS[params.section as keyof typeof SEARCH_SECTIONS];
  if (!kind) {
    throw ApiError.of(
      "not_found",
      msg("server.noSearchSection", { section: params.section, sections: Object.keys(SEARCH_SECTIONS).join(", ") }),
    );
  }
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim();
  if (!query) throw invalid(msg("server.queryRequired"));
  const page = queryInt(url, "page", { min: 1, max: TMDB_MAX_PAGE }) ?? 1;
  await requireTmdbConfigured();

  const data = await loadSearchSection(await ctx.viewer(), query, kind, page);
  const paging = { page: data.page, totalPages: data.totalPages, totalResults: data.totalResults };
  if (data.kind === "movie" || data.kind === "tv") {
    const rules = await loadPosterActionRules(ctx.user, data.items);
    return { ...paging, results: data.items.map((card) => searchTitleDto(rules, card)) };
  }
  if (data.kind === "person") return { ...paging, results: data.items.map(searchPersonDto) };
  return { ...paging, results: data.items.map(searchCompanyDto) };
});
