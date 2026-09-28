// Which language TMDb is asked for, and how a translated copy of a title
// is laid over the English one. Pure (no database, no request), so the
// client, the translation cache and the tests share it.
//
// Marquee's own words follow the viewer's language (lib/i18n); TMDb's —
// titles, overviews, taglines, genres, season and episode names, posters
// and logos with text — follow it too. English stays the source: the
// database's `titles` rows are always English, a translation lives beside
// them (title_translations), and anything TMDb has no translation for
// falls back to English one field at a time.

import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales";
import type { TmdbLogoImage } from "@/lib/tmdb/logo";

/** Where Latin-American Spanish is the Spanish people read. */
const LATIN_AMERICAN_REGIONS = new Set(["AR", "BO", "CL", "CO", "CR", "CU", "DO", "EC", "GT", "HN", "MX", "NI", "PA", "PE", "PR", "PY", "SV", "US", "UY", "VE"]);

/**
 * TMDb's `language` for a viewer's language ("es" → "es-ES"). Spanish
 * follows the household's region (Settings › Discover › Region &
 * language): a Latin-American one (or the US) gets TMDb's Mexican Spanish,
 * which is what's on screens there. English is en-US, as it always was.
 */
export function tmdbContentLanguage(locale: Locale, region?: string | null): string {
  switch (locale) {
    case "en":
      return "en-US";
    case "es":
      return region && LATIN_AMERICAN_REGIONS.has(region.toUpperCase()) ? "es-MX" : "es-ES";
    case "fr":
      return region?.toUpperCase() === "CA" ? "fr-CA" : "fr-FR";
    case "de":
      return "de-DE";
    case "pt-BR":
      return "pt-BR";
  }
}

/** The ISO 639-1 part ("es-MX" → "es"), which is what TMDb tags images
 * and videos with. */
export function isoLanguage(tmdbLanguage: string): string {
  return tmdbLanguage.split("-")[0].toLowerCase();
}

/** `include_image_language` for a language: its own artwork first, then
 * English, then artwork with no text at all. */
export function imageLanguages(tmdbLanguage: string): string {
  const iso = isoLanguage(tmdbLanguage);
  return iso === "en" ? "en,null" : `${iso},en,null`;
}

/** Whether a language needs anything beyond the English copy. */
export function isEnglish(locale: Locale): boolean {
  return locale === DEFAULT_LOCALE;
}

/** A translated field, or the English one when TMDb had nothing (it
 * answers with "" or null for a missing overview or tagline). */
export function pick<T extends string | null | undefined>(translated: string | null | undefined, english: T): string | T {
  const value = translated?.trim();
  return value ? value : english;
}

// TMDb names an episode nobody has translated "Episodio 3" / "Épisode 3" /
// "Folge 3" rather than leaving it blank — no better than the English name.
const GENERIC_EPISODE_NAME = /^(episode|episodio|épisode|episódio|folge|capítulo|capitulo)\s*\d+$/i;

export function isGenericEpisodeName(name: string | null | undefined): boolean {
  return !name || GENERIC_EPISODE_NAME.test(name.trim());
}

/** One episode's (or season's) name: the translated one, unless it's just
 * TMDb's placeholder and the English one is a real name. */
export function pickEpisodeName(translated: string | null | undefined, english: string): string {
  if (!translated?.trim()) return english;
  if (isGenericEpisodeName(translated) && !isGenericEpisodeName(english)) return english;
  return translated;
}

type EpisodeLike = { episode_number: number; name: string; overview: string };

/** A season's episodes in a language, each field falling back to English. */
export function mergeEpisodes<T extends EpisodeLike>(english: T[], translated: T[] | null | undefined): T[] {
  if (!translated?.length) return english;
  const byNumber = new Map(translated.map((episode) => [episode.episode_number, episode]));
  return english.map((episode) => {
    const other = byNumber.get(episode.episode_number);
    if (!other) return episode;
    return { ...episode, name: pickEpisodeName(other.name, episode.name), overview: pick(other.overview, episode.overview) };
  });
}

/** What a translation keeps beyond name/overview/tagline/poster: the bits
 * of the title page TMDb translates, small enough to store per language.
 * The heavy details (cast, crew, providers, release dates) stay on the
 * English row and are shared by every language. */
export type TranslationDetails = {
  genres?: { id: number; name: string }[];
  seasons?: { season_number: number; name: string }[];
  /** The logo in this language, when TMDb has one. */
  logo?: TmdbLogoImage | null;
  /** A trailer in this language (YouTube key), when TMDb has one. */
  trailerKey?: string | null;
  recommendations?: { id: number; name: string; posterPath: string | null }[];
};

export type TitleTranslation = {
  name: string | null;
  overview: string | null;
  tagline: string | null;
  posterPath: string | null;
  /** Null for a light copy (saved from a list); the title page fetches the
   * full one the first time it's opened in that language. */
  details: TranslationDetails | null;
};

type BaseTitle = { name: string; overview: string | null; posterPath: string | null };

type RawLike = {
  tagline?: string | null;
  genres?: { id: number; name: string }[];
  seasons?: { season_number: number; name: string }[];
  images?: { logos?: TmdbLogoImage[] };
  videos?: { results: { key: string; site: string; type: string; official: boolean }[] };
  recommendations?: { results: { id: number; title?: string; name?: string; poster_path: string | null }[] };
};

/**
 * The English row and its raw TMDb details with a translation laid over
 * them, field by field — anything the translation lacks stays English.
 * Genres, seasons and recommendations are matched by id, so their order
 * (and anything keyed on it) is the English copy's.
 */
export function overlayTitle<T extends BaseTitle, R extends RawLike>(
  title: T,
  raw: R | null,
  translation: TitleTranslation | null,
): { title: T; raw: R | null } {
  if (!translation) return { title, raw };
  const name = pick(translation.name, title.name);
  const localizedTitle: T = {
    ...title,
    name,
    overview: pick(translation.overview, title.overview),
    posterPath: translation.posterPath || title.posterPath,
  };
  const details = translation.details;
  if (!raw) return { title: localizedTitle, raw };

  const localizedRaw: R = { ...raw, tagline: pick(translation.tagline, raw.tagline ?? null) };
  if (details?.genres?.length && raw.genres) {
    const names = new Map(details.genres.map((genre) => [genre.id, genre.name]));
    localizedRaw.genres = raw.genres.map((genre) => ({ ...genre, name: pick(names.get(genre.id), genre.name) }));
  }
  if (details?.seasons?.length && raw.seasons) {
    const names = new Map(details.seasons.map((season) => [season.season_number, season.name]));
    localizedRaw.seasons = raw.seasons.map((season) => ({
      ...season,
      name: pickEpisodeName(names.get(season.season_number), season.name),
    }));
  }
  if (details?.logo) {
    localizedRaw.images = { ...raw.images, logos: [details.logo] };
  } else if (details && name !== title.name) {
    // An English logo would spell out a different name than the page's.
    localizedRaw.images = { ...raw.images, logos: [] };
  }
  if (details?.trailerKey) {
    localizedRaw.videos = {
      results: [{ key: details.trailerKey, site: "YouTube", type: "Trailer", official: true }, ...(raw.videos?.results ?? [])],
    };
  }
  if (details?.recommendations?.length && raw.recommendations) {
    const byId = new Map(details.recommendations.map((item) => [item.id, item]));
    localizedRaw.recommendations = {
      ...raw.recommendations,
      results: raw.recommendations.results.map((item) => {
        const other = byId.get(item.id);
        if (!other) return item;
        const localizedName = pick(other.name, item.title || item.name || "");
        return {
          ...item,
          ...(item.title !== undefined ? { title: localizedName } : { name: localizedName }),
          poster_path: other.posterPath || item.poster_path,
        };
      }),
    };
  }
  return { title: localizedTitle, raw: localizedRaw };
}

/** A card in a list (a person's credits, a studio's catalog) with whatever
 * translation is known for it. */
export function overlayCard<T extends { name: string; posterPath: string | null }>(
  card: T,
  translation: Pick<TitleTranslation, "name" | "posterPath"> | null | undefined,
): T {
  if (!translation) return card;
  return { ...card, name: pick(translation.name, card.name), posterPath: translation.posterPath || card.posterPath };
}

/** A notification's words with the title's English name swapped for its
 * name in the reader's language. Only whole-name matches, and only a name
 * long enough not to hit an ordinary word. */
export function swapTitleName(text: string, englishName: string, localizedName: string | null | undefined): string {
  if (!localizedName || localizedName === englishName || englishName.trim().length < 2) return text;
  return text.split(englishName).join(localizedName);
}
