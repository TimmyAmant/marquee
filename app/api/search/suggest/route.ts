import { NextResponse } from "next/server";
import { searchMulti } from "@/lib/tmdb/client";

export type SearchSuggestion = {
  id: number;
  mediaType: "person" | "movie" | "tv";
  name: string;
  posterPath: string | null;
  subtitle: string | null;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();

  if (!query || query.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const multi = await searchMulti(query).catch(() => null);
  if (!multi) return NextResponse.json({ results: [] });

  const suggestions: SearchSuggestion[] = multi.results
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

  return NextResponse.json({ results: suggestions });
}
