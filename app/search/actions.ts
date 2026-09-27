"use server";

import { getViewerContext } from "@/lib/integrations/library-owner";
import { loadSearchSection, parseSearchSection, type SearchSectionData } from "@/lib/pages/search";
import { TMDB_MAX_PAGE } from "@/lib/discover/paging";

/** Infinite-scroll "load more" for a search section's See all
 * (/search?q=&type=): the next page of movies, TV shows, people or
 * studios & networks, enriched the way the first page was. */
export async function loadMoreSearchSection(
  query: string,
  type: string,
  page: number,
): Promise<{ section: SearchSectionData | null; hasNextPage: boolean }> {
  const viewer = await getViewerContext();
  const kind = parseSearchSection(type);
  // Actions don't get the proxy's sign-in redirect for free, so check here
  // too rather than serve TMDb pages to anyone who can reach the endpoint.
  if (
    !viewer.session ||
    !kind ||
    typeof query !== "string" ||
    !query.trim() ||
    !Number.isInteger(page) ||
    page < 1 ||
    page > TMDB_MAX_PAGE
  ) {
    return { section: null, hasNextPage: false };
  }
  const section = await loadSearchSection(viewer, query.trim(), kind, page);
  return { section, hasNextPage: section.page < section.totalPages };
}
