// Titles in the viewer's language. The `titles` row (lib/tmdb/cache.ts) is
// always English and carries everything heavy — cast, crew, providers,
// release dates — once for every language; a title_translations row
// carries only what TMDb translates, per language, filled lazily:
//
// - the title page fetches a title's full translation the first time
//   someone opens it in that language (and again once it's as old as the
//   English copy's TTL);
// - lists that come from TMDb in the viewer's language already (a person's
//   credits) save a light copy — name, overview, poster — so the database's
//   own lists (a studio's catalog, the library) can show those names too,
//   in one query, without asking TMDb for every title.
//
// Anything missing falls back to English field by field
// (lib/tmdb/language.ts).

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { titleTranslations, titles } from "@/lib/db/schema";
import type { MediaType } from "@/lib/db/schema";
import type { Locale } from "@/lib/i18n/locales";
import { isStale } from "@/lib/tmdb/cache-policy";
import { contentLanguageFor, findTrailer, getLocalizedTitleDetails, type TmdbLocalizedDetails } from "@/lib/tmdb/client";
import { isoLanguage, overlayTitle, type TitleTranslation, type TranslationDetails } from "@/lib/tmdb/language";
import { pickTitleLogo } from "@/lib/tmdb/logo";

type TranslationRow = typeof titleTranslations.$inferSelect;

function fromRow(row: TranslationRow): TitleTranslation {
  return {
    name: row.name,
    overview: row.overview,
    tagline: row.tagline,
    posterPath: row.posterPath,
    details: (row.details as TranslationDetails | null) ?? null,
  };
}

/** What a translation keeps from TMDb's answer in `language`. */
export function translationFromTmdb(details: TmdbLocalizedDetails, language: string): TitleTranslation {
  const iso = isoLanguage(language);
  // Only artwork actually in this language: an English logo or trailer is
  // already on the English copy.
  const logo = pickTitleLogo(details.images, iso);
  const trailer = findTrailer({ results: (details.videos?.results ?? []).filter((video) => video.iso_639_1 === iso) });
  return {
    name: details.title ?? details.name ?? null,
    overview: details.overview || null,
    tagline: details.tagline || null,
    posterPath: details.poster_path ?? null,
    details: {
      genres: (details.genres ?? []).map(({ id, name }) => ({ id, name })),
      seasons: (details.seasons ?? []).map(({ season_number, name }) => ({ season_number, name })),
      logo: logo?.iso_639_1 === iso ? logo : null,
      trailerKey: trailer?.key ?? null,
      recommendations: (details.recommendations?.results ?? []).map((item) => ({
        id: item.id,
        name: item.title || item.name || "",
        posterPath: item.poster_path,
      })),
    },
  };
}

/**
 * A title's full translation for `locale`, from the database or (the first
 * time, or once it's stale) from TMDb. Null for English, and when TMDb
 * can't be reached and nothing is saved yet — the page is English then.
 */
export async function getTitleTranslation(
  title: { id: string; mediaType: MediaType; tmdbId: number },
  locale: Locale,
): Promise<TitleTranslation | null> {
  if (locale === "en") return null;
  const [saved] = await db
    .select()
    .from(titleTranslations)
    .where(and(eq(titleTranslations.titleId, title.id), eq(titleTranslations.language, locale)))
    .limit(1);
  if (saved?.details && !isStale(saved.refreshedAt)) return fromRow(saved);

  try {
    const language = await contentLanguageFor(locale);
    const fetched = translationFromTmdb(await getLocalizedTitleDetails(title.mediaType, title.tmdbId, language), language);
    const values = { ...fetched, refreshedAt: new Date() };
    await db
      .insert(titleTranslations)
      .values({ titleId: title.id, language: locale, ...values })
      .onConflictDoUpdate({ target: [titleTranslations.titleId, titleTranslations.language], set: values });
    return fetched;
  } catch (err) {
    console.error("[tmdb-translations] couldn't fetch %s/%s in %s:", title.mediaType, title.tmdbId, locale, err);
    return saved ? fromRow(saved) : null;
  }
}

/** Whatever translations are saved for these titles, full or light, in
 * one query — for lists. */
export async function getSavedTranslations(titleIds: readonly string[], locale: Locale): Promise<Map<string, TitleTranslation>> {
  const result = new Map<string, TitleTranslation>();
  if (locale === "en" || titleIds.length === 0) return result;
  const rows = await db
    .select()
    .from(titleTranslations)
    .where(and(inArray(titleTranslations.titleId, [...new Set(titleIds)]), eq(titleTranslations.language, locale)));
  for (const row of rows) result.set(row.titleId, fromRow(row));
  return result;
}

/** The saved names of these titles in `locale`, keyed "movie:603" — for
 * words written for someone else (a notification's recipient). */
export async function getTranslatedNames(
  items: readonly { mediaType: MediaType; tmdbId: number }[],
  locale: Locale,
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (locale === "en" || items.length === 0) return result;
  const rows = await db
    .select({ mediaType: titles.mediaType, tmdbId: titles.tmdbId, name: titleTranslations.name })
    .from(titleTranslations)
    .innerJoin(titles, eq(titles.id, titleTranslations.titleId))
    .where(
      and(
        eq(titleTranslations.language, locale),
        inArray(
          titles.tmdbId,
          items.map((item) => item.tmdbId),
        ),
      ),
    );
  const wanted = new Set(items.map((item) => `${item.mediaType}:${item.tmdbId}`));
  for (const row of rows) {
    const key = `${row.mediaType}:${row.tmdbId}`;
    if (row.name && wanted.has(key)) result.set(key, row.name);
  }
  return result;
}

/**
 * Saves the names, overviews and posters a list brought back in `locale`
 * as light translations. A full translation already saved is left alone
 * (it's newer or richer); a light one is updated.
 */
export async function saveLightTranslations(
  locale: Locale,
  items: readonly { titleId: string; name: string | null; overview?: string | null; posterPath?: string | null }[],
): Promise<void> {
  if (locale === "en" || items.length === 0) return;
  const unique = new Map(items.map((item) => [item.titleId, item]));
  await db
    .insert(titleTranslations)
    .values(
      [...unique.values()].map((item) => ({
        titleId: item.titleId,
        language: locale,
        name: item.name || null,
        overview: item.overview || null,
        posterPath: item.posterPath ?? null,
        details: null,
      })),
    )
    .onConflictDoUpdate({
      target: [titleTranslations.titleId, titleTranslations.language],
      set: {
        name: sql`excluded.name`,
        overview: sql`coalesce(excluded.overview, ${titleTranslations.overview})`,
        posterPath: sql`coalesce(excluded.poster_path, ${titleTranslations.posterPath})`,
      },
      setWhere: isNull(titleTranslations.details),
    });
}

/** Title rows (from the database's own lists) with the names, overviews
 * and posters saved in `locale` — English where none is. Same rows, same
 * order: only what's shown changes. */
export async function withSavedTranslations<
  T extends { id: string; name: string; overview: string | null; posterPath: string | null },
>(rows: T[], locale: Locale): Promise<T[]> {
  if (locale === "en" || rows.length === 0) return rows;
  const saved = await getSavedTranslations(
    rows.map((row) => row.id),
    locale,
  ).catch(() => new Map<string, TitleTranslation>());
  return rows.map((row) => overlayTitle(row, null, saved.get(row.id) ?? null).title);
}
