// Pure query-interpretation helpers for search — dependency-free so they can
// be unit tested. Used by lib/pages/search.ts.

// Words that describe "what kind of thing to search for" rather than the
// theme itself — stripped before matching against genres/keywords, since
// people naturally type "action movies" or "national disaster movies and tv
// shows" and mean the theme, not those literal words.
const MEDIA_WORDS = /\b(movies?|films?|shows?|series|tv)\b/gi;

export function normalizeForThemeMatch(query: string): string {
  return query.replace(MEDIA_WORDS, "").replace(/\s+/g, " ").trim();
}

export function findGenreMatch<G extends { id: number; name: string }>(genres: G[], normalized: string): G | null {
  if (!normalized) return null;
  const lower = normalized.toLowerCase();
  const exact = genres.find((g) => g.name.toLowerCase() === lower);
  if (exact) return exact;

  // Only consider a substring match for short queries — TMDb genre names are
  // at most two words, so anything longer is a real title/phrase that just
  // happens to contain a genre word (e.g. "Crime and Punishment" contains
  // "Crime"), not a genre-browse request.
  if (lower.split(" ").length > 2) return null;
  const partial = genres.find(
    (g) => g.name.toLowerCase().includes(lower) || lower.includes(g.name.toLowerCase()),
  );
  return partial ?? null;
}
