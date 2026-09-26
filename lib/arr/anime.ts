// Whether a title is anime, for picking a Sonarr server's anime quality
// profile, root folder, tags and the "anime" series type (which changes how
// Sonarr numbers and searches episodes). Pure, so it's shared with tests.
//
// Seerr's test is TMDb's "anime" keyword (id 210024). TMDb's keywords are
// crowd-sourced and a fair number of Japanese animated shows lack it, so this
// also counts anything that's both Animation (genre 16) and from Japan
// (origin country JP, or original language Japanese) — while a western
// cartoon (Animation from anywhere else) stays a regular show.

/** TMDb's "anime" keyword. */
export const ANIME_KEYWORD_ID = 210024;
/** TMDb's Animation genre (same id for movies and TV). */
export const ANIMATION_GENRE_ID = 16;

type KeywordRef = { id: number; name?: string };

export type AnimeSignals = {
  genres?: { id: number; name?: string }[] | null;
  /** TV: `keywords.results`; movies: `keywords.keywords`. */
  keywords?: { results?: KeywordRef[]; keywords?: KeywordRef[] } | null;
  origin_country?: string[] | null;
  original_language?: string | null;
  production_countries?: { iso_3166_1?: string }[] | null;
};

export function isAnime(details: AnimeSignals | null | undefined): boolean {
  if (!details) return false;
  const keywords = details.keywords?.results ?? details.keywords?.keywords ?? [];
  if (keywords.some((k) => k.id === ANIME_KEYWORD_ID || k.name?.trim().toLowerCase() === "anime")) return true;

  const animated = (details.genres ?? []).some((g) => g.id === ANIMATION_GENRE_ID);
  if (!animated) return false;
  const fromJapan =
    (details.origin_country ?? []).includes("JP") ||
    (details.production_countries ?? []).some((c) => c.iso_3166_1 === "JP") ||
    details.original_language === "ja";
  return fromJapan;
}
