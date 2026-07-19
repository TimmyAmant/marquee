import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { companies, companyTitles, credits, people, titles } from "@/lib/db/schema";
import type { MediaType } from "@/lib/db/schema";
import * as tmdb from "./client";
import * as tvdb from "@/lib/tvdb/client";
import { getTvdbApiKey } from "@/lib/integrations/app-settings";

const TTL_MS = 14 * 24 * 60 * 60 * 1000;
// A title missing its poster/backdrop/overview gets retried far more
// aggressively than the normal TTL (see isIncomplete below), but only
// within this window — plenty of titles never get one of these fields at
// all (an old movie TMDb only ever gave a poster to, say), and retrying
// those forever on every single view would mean a live TMDb refetch plus a
// full DB write on every page load, indefinitely, for no eventual payoff.
// Past this window a still-incomplete title falls back to the normal TTL
// like anything else.
const INCOMPLETE_RETRY_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
const CATALOG_MAX_PAGES = 5;

function isStale(refreshedAt: Date): boolean {
  return Date.now() - refreshedAt.getTime() > TTL_MS;
}

/** A title first cached before TMDb had finished uploading its poster,
 * backdrop, or writing an overview (common right after a title is
 * announced, or for niche/non-English releases) would otherwise be locked
 * into showing incomplete art for the full 14-day TTL even once TMDb fills
 * it in — so treat any of the three as stale regardless of age, forcing a
 * re-check on every view until TMDb actually has the data. Backdrops in
 * particular tend to lag behind posters for very new releases. The hourly
 * Next.js fetch cache on tmdbFetch caps the real cost of the outbound
 * request at one per title per hour; INCOMPLETE_RETRY_WINDOW_MS bounds how
 * long this aggressive retry lasts before falling back to the normal TTL. */
function isIncomplete(row: {
  posterPath: string | null;
  backdropPath: string | null;
  overview: string | null;
}): boolean {
  return !row.posterPath || !row.backdropPath || !row.overview;
}

export type LightTitleInput = {
  mediaType: MediaType;
  tmdbId: number;
  name: string;
  overview?: string | null;
  posterPath?: string | null;
  backdropPath?: string | null;
  releaseDate?: string | null;
  firstAirDate?: string | null;
};

export async function upsertTitleLight(input: LightTitleInput) {
  const values = {
    mediaType: input.mediaType,
    tmdbId: input.tmdbId,
    name: input.name,
    overview: input.overview ?? null,
    posterPath: input.posterPath ?? null,
    backdropPath: input.backdropPath ?? null,
    releaseDate: input.releaseDate || null,
    firstAirDate: input.firstAirDate || null,
    refreshedAt: new Date(),
  };
  const [row] = await db
    .insert(titles)
    .values(values)
    .onConflictDoUpdate({
      target: [titles.mediaType, titles.tmdbId],
      set: {
        name: values.name,
        overview: values.overview,
        posterPath: values.posterPath,
        backdropPath: values.backdropPath,
        releaseDate: values.releaseDate,
        firstAirDate: values.firstAirDate,
        refreshedAt: values.refreshedAt,
      },
    })
    .returning();
  return row;
}

async function upsertTitleFull(input: {
  mediaType: MediaType;
  tmdbId: number;
  name: string;
  overview: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  releaseDate: string | null;
  firstAirDate: string | null;
  status: string | null;
  tvdbId: number | null;
  imdbId: string | null;
  rawTmdb: unknown;
  rawTvdb?: unknown;
}) {
  const values = { ...input, releaseDate: input.releaseDate || null, firstAirDate: input.firstAirDate || null, refreshedAt: new Date() };
  const [row] = await db
    .insert(titles)
    .values(values)
    .onConflictDoUpdate({
      target: [titles.mediaType, titles.tmdbId],
      set: {
        name: values.name,
        overview: values.overview,
        posterPath: values.posterPath,
        backdropPath: values.backdropPath,
        releaseDate: values.releaseDate,
        firstAirDate: values.firstAirDate,
        status: values.status,
        rawTvdb: values.rawTvdb,
        tvdbId: values.tvdbId,
        imdbId: values.imdbId,
        rawTmdb: values.rawTmdb,
        refreshedAt: values.refreshedAt,
      },
    })
    .returning();
  return row;
}

export async function getOrFetchTitle(mediaType: MediaType, tmdbId: number) {
  const [cached] = await db
    .select()
    .from(titles)
    .where(and(eq(titles.mediaType, mediaType), eq(titles.tmdbId, tmdbId)))
    .limit(1);

  const withinIncompleteRetryWindow =
    cached && Date.now() - cached.refreshedAt.getTime() < INCOMPLETE_RETRY_WINDOW_MS;
  if (
    cached &&
    cached.rawTmdb &&
    !isStale(cached.refreshedAt) &&
    (!isIncomplete(cached) || !withinIncompleteRetryWindow)
  ) {
    return cached;
  }

  try {
    if (mediaType === "movie") {
      const details = await tmdb.getMovieDetails(tmdbId);
      return await upsertTitleFull({
        mediaType,
        tmdbId,
        name: details.title,
        overview: details.overview,
        posterPath: details.poster_path,
        backdropPath: details.backdrop_path,
        releaseDate: details.release_date,
        firstAirDate: null,
        status: details.status,
        tvdbId: null,
        imdbId: details.imdb_id,
        rawTmdb: details,
      });
    }

    const details = await tmdb.getTvDetails(tmdbId);
    const tvdbId = details.external_ids?.tvdb_id ?? null;

    // TMDb's own poster/overview win when present; TheTVDB (Sonarr's own
    // metadata source) only fills the gap when TMDb genuinely doesn't have
    // it yet — same "isIncomplete" trigger as the cache-freshness check
    // above, not attempted for every show on every fetch.
    let posterPath: string | null = details.poster_path;
    let overview: string | null = details.overview;
    let rawTvdb: unknown;

    if (tvdbId && (!posterPath || !overview)) {
      const apiKey = await getTvdbApiKey();
      if (apiKey) {
        const tvdbSeries = await tvdb.getSeriesExtended(apiKey, tvdbId).catch(() => null);
        if (tvdbSeries) {
          rawTvdb = tvdbSeries;
          if (!posterPath) posterPath = tvdbSeries.image;
          if (!overview) overview = tvdb.pickOverview(tvdbSeries.overviewTranslations);
        }
      }
    }

    return await upsertTitleFull({
      mediaType,
      tmdbId,
      name: details.name,
      overview,
      posterPath,
      backdropPath: details.backdrop_path,
      releaseDate: null,
      firstAirDate: details.first_air_date,
      status: details.status,
      tvdbId,
      imdbId: details.external_ids?.imdb_id ?? null,
      rawTmdb: details,
      rawTvdb,
    });
  } catch (err) {
    // A 404 means TMDb itself no longer has this id (removed/merged) — that's
    // a real "not found," not an outage, so let it propagate instead of
    // masking it with old data. Anything else (network blip, rate limit,
    // TMDb downtime) is transient: a stale-but-present cached row is still a
    // better result than a hard failure for those.
    if (err instanceof tmdb.TmdbError && err.status === 404) throw err;
    if (cached && cached.rawTmdb) {
      console.error(`[tmdb-cache] refresh failed for ${mediaType}/${tmdbId}, serving stale cache:`, err);
      return cached;
    }
    throw err;
  }
}

export async function getOrFetchPersonWithCredits(tmdbId: number) {
  const [cachedPerson] = await db.select().from(people).where(eq(people.tmdbId, tmdbId)).limit(1);

  if (!cachedPerson || isStale(cachedPerson.refreshedAt)) {
    const [details, combinedCredits] = await Promise.all([
      tmdb.getPersonDetails(tmdbId),
      tmdb.getPersonCombinedCredits(tmdbId),
    ]);

    const [personRow] = await db
      .insert(people)
      .values({
        tmdbId,
        name: details.name,
        alsoKnownAs: details.also_known_as,
        biography: details.biography || null,
        birthday: details.birthday || null,
        deathday: details.deathday || null,
        placeOfBirth: details.place_of_birth,
        profilePath: details.profile_path,
        rawTmdb: details,
        refreshedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: people.tmdbId,
        set: {
          name: details.name,
          alsoKnownAs: details.also_known_as,
          biography: details.biography || null,
          birthday: details.birthday || null,
          deathday: details.deathday || null,
          placeOfBirth: details.place_of_birth,
          profilePath: details.profile_path,
          rawTmdb: details,
          refreshedAt: new Date(),
        },
      })
      .returning();

    // Acting credits only (department/character-driven filmography); dedupe by media_type+id.
    const seen = new Set<string>();
    for (const item of combinedCredits.cast) {
      const key = `${item.media_type}:${item.id}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const titleRow = await upsertTitleLight({
        mediaType: item.media_type,
        tmdbId: item.id,
        name: item.title || item.name || "Untitled",
        overview: item.overview,
        posterPath: item.poster_path,
        releaseDate: item.release_date,
        firstAirDate: item.first_air_date,
      });

      await db
        .insert(credits)
        .values({
          personId: personRow.id,
          titleId: titleRow.id,
          department: "Acting",
          characterName: item.character || null,
          episodeCount: item.episode_count ?? null,
          order: item.order ?? null,
        })
        .onConflictDoNothing();
    }

    return getPersonWithCreditsFromDb(personRow.id);
  }

  return getPersonWithCreditsFromDb(cachedPerson.id);
}

async function getPersonWithCreditsFromDb(personId: string) {
  const [person] = await db.select().from(people).where(eq(people.id, personId)).limit(1);
  const filmography = await db
    .select({ credit: credits, title: titles })
    .from(credits)
    .innerJoin(titles, eq(credits.titleId, titles.id))
    .where(eq(credits.personId, personId))
    .orderBy(desc(sql`coalesce(${titles.releaseDate}, ${titles.firstAirDate})`));

  return { person, filmography };
}

export async function getOrFetchCompanyWithCatalog(tmdbId: number) {
  const [cachedCompany] = await db
    .select()
    .from(companies)
    .where(eq(companies.tmdbId, tmdbId))
    .limit(1);

  if (!cachedCompany || isStale(cachedCompany.refreshedAt)) {
    const details = await tmdb.getCompanyDetails(tmdbId);

    const [companyRow] = await db
      .insert(companies)
      .values({
        tmdbId,
        name: details.name,
        description: details.description || null,
        logoPath: details.logo_path,
        originCountry: details.origin_country,
        parentCompanyTmdbId: details.parent_company?.id ?? null,
        rawTmdb: details,
        refreshedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: companies.tmdbId,
        set: {
          name: details.name,
          description: details.description || null,
          logoPath: details.logo_path,
          originCountry: details.origin_country,
          parentCompanyTmdbId: details.parent_company?.id ?? null,
          rawTmdb: details,
          refreshedAt: new Date(),
        },
      })
      .returning();

    for (const fetchPage of [tmdb.discoverMoviesByCompany, tmdb.discoverTvByCompany]) {
      const mediaType: MediaType = fetchPage === tmdb.discoverMoviesByCompany ? "movie" : "tv";
      for (let page = 1; page <= CATALOG_MAX_PAGES; page++) {
        const response = await fetchPage(tmdbId, page);
        for (const item of response.results) {
          const titleRow = await upsertTitleLight({
            mediaType,
            tmdbId: item.id,
            name: item.title || item.name || "Untitled",
            overview: item.overview,
            posterPath: item.poster_path,
            backdropPath: item.backdrop_path,
            releaseDate: item.release_date,
            firstAirDate: item.first_air_date,
          });

          await db
            .insert(companyTitles)
            .values({ companyId: companyRow.id, titleId: titleRow.id })
            .onConflictDoNothing();
        }
        if (page >= response.total_pages) break;
      }
    }

    return getCompanyWithCatalogFromDb(companyRow.id);
  }

  return getCompanyWithCatalogFromDb(cachedCompany.id);
}

async function getCompanyWithCatalogFromDb(companyId: string) {
  const [company] = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1);
  const catalog = await db
    .select({ title: titles })
    .from(companyTitles)
    .innerJoin(titles, eq(companyTitles.titleId, titles.id))
    .where(eq(companyTitles.companyId, companyId))
    .orderBy(desc(sql`coalesce(${titles.releaseDate}, ${titles.firstAirDate})`));

  return { company, catalog: catalog.map((row) => row.title) };
}
