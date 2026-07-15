// Pure, dependency-free helper — kept separate from lib/tmdb/client.ts so
// client components can use it without pulling in server-only code (TMDb
// fetch functions there depend on the database to resolve the API key).
export type TmdbImageSize = "w92" | "w154" | "w185" | "w342" | "w500" | "w780" | "original";

export function tmdbImageUrl(
  path: string | null | undefined,
  size: TmdbImageSize = "w500",
): string | null {
  if (!path) return null;
  return `https://image.tmdb.org/t/p/${size}${path}`;
}
