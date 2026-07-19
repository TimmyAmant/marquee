// Pure, dependency-free helper — kept separate from lib/tmdb/client.ts so
// client components can use it without pulling in server-only code (TMDb
// fetch functions there depend on the database to resolve the API key).
export type TmdbImageSize = "w92" | "w154" | "w185" | "w342" | "w500" | "w780" | "original";

export function tmdbImageUrl(
  path: string | null | undefined,
  size: TmdbImageSize = "w500",
): string | null {
  if (!path) return null;
  // A stored posterPath/backdropPath is sometimes a full URL rather than a
  // TMDb-relative path — e.g. a TheTVDB artwork URL used as a fallback when
  // TMDb itself doesn't have an image yet. Pass those through untouched
  // instead of double-prefixing them with TMDb's own CDN base.
  if (/^https?:\/\//.test(path)) return path;
  return `https://image.tmdb.org/t/p/${size}${path}`;
}
