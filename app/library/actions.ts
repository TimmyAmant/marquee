"use server";

import { getViewerContext } from "@/lib/integrations/library-owner";
import { libraryEntry } from "@/lib/api/routes/library";
import { statusKey } from "@/lib/api/mappers";
import { parseLibraryQuery, type RawLibraryQuery } from "@/lib/library/list";
import { loadLibraryPage } from "@/lib/pages/library";
import type { LibraryEntry } from "@/lib/api/types";

/** The Library grid's next page — the same filters, sort and mapping the
 * server render used (lib/pages/library.ts), asked for by the client as
 * the user scrolls. */
export async function loadMoreLibraryAction(
  raw: RawLibraryQuery,
  page: number,
): Promise<{ entries: LibraryEntry[]; page: number; totalPages: number }> {
  const viewer = await getViewerContext();
  if (!viewer.session) return { entries: [], page, totalPages: page };
  const { query } = parseLibraryQuery({ ...raw, page: String(page) });
  const data = await loadLibraryPage(viewer, query);
  return {
    entries: data.page.results.map((item) =>
      libraryEntry(item, {
        favorited: data.favoritedKeys.has(statusKey(item.mediaType, item.tmdbId)),
        isAdmin: viewer.isAdmin,
        episodes: data.episodeCounts.get(statusKey(item.mediaType, item.tmdbId)),
      }),
    ),
    page: data.page.page,
    totalPages: data.page.totalPages,
  };
}
