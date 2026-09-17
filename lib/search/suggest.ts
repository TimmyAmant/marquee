import { searchMulti } from "@/lib/tmdb/client";

export type SearchSuggestion = {
  id: number;
  mediaType: "person" | "movie" | "tv";
  name: string;
  posterPath: string | null;
  subtitle: string | null;
};

/** Type-ahead suggestions for the header search bar — shared by
 * /api/search/suggest (web) and GET /api/v1/search/suggest. Queries shorter
 * than two characters, and any TMDb failure, yield an empty list. */
export async function getSearchSuggestions(rawQuery: string | null | undefined): Promise<SearchSuggestion[]> {
  const query = rawQuery?.trim();
  if (!query || query.length < 2) return [];

  const multi = await searchMulti(query).catch(() => null);
  if (!multi) return [];

  return multi.results
    .filter((r) => r.media_type === "person" || r.media_type === "movie" || r.media_type === "tv")
    .slice(0, 7)
    .map((r) => ({
      id: r.id,
      mediaType: r.media_type,
      name: r.name || r.title || "",
      posterPath: (r.media_type === "person" ? r.profile_path : r.poster_path) ?? null,
      subtitle:
        r.media_type === "person"
          ? (r.known_for_department ?? null)
          : (r.release_date || r.first_air_date || "").slice(0, 4) || null,
    }));
}
