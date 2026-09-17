import { ApiError } from "@/lib/api/errors";
import { parseIdSegment, parseMediaType } from "@/lib/api/request";
import { getOrFetchTitle } from "@/lib/tmdb/cache";
import { TmdbError } from "@/lib/tmdb/client";
import type { MediaType } from "@/lib/db/schema";

export type TitleParams = { type: string; id: string };

export function parseTitleParams(params: TitleParams): { mediaType: MediaType; tmdbId: number } {
  return { mediaType: parseMediaType(params.type), tmdbId: parseIdSegment(params.id, "TMDb id") };
}

/** The cached title row, or 404 when TMDb has no such title. Other TMDb
 * failures propagate (→ 502 upstream). */
export async function requireTitle(mediaType: MediaType, tmdbId: number) {
  try {
    return await getOrFetchTitle(mediaType, tmdbId);
  } catch (err) {
    if (err instanceof TmdbError && err.status === 404) {
      throw ApiError.of("not_found", "No such title on TMDb.");
    }
    throw err;
  }
}
