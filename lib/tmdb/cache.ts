import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { companies, companyTitles, credits, people, titles } from "@/lib/db/schema";
import type { MediaType } from "@/lib/db/schema";
import * as tmdb from "./client";

const TTL_MS = 14 * 24 * 60 * 60 * 1000;
const CATALOG_MAX_PAGES = 5;

function isStale(refreshedAt: Date): boolean {
  return Date.now() - refreshedAt.getTime() > TTL_MS;
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

  if (cached && cached.rawTmdb && !isStale(cached.refreshedAt)) {
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

    return await upsertTitleFull({
      mediaType,
      tmdbId,
      name: details.name,
      overview: details.overview,
      posterPath: details.poster_path,
      backdropPath: details.backdrop_path,
      releaseDate: null,
      firstAirDate: details.first_air_date,
      status: details.status,
      tvdbId: details.external_ids?.tvdb_id ?? null,
      imdbId: details.external_ids?.imdb_id ?? null,
      rawTmdb: details,
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
