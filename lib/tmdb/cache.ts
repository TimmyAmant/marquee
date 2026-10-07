import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { companies, companyTitles, credits, people, titles } from "@/lib/db/schema";
import type { MediaType } from "@/lib/db/schema";
import * as tmdb from "./client";
import * as tvdb from "@/lib/tvdb/client";
import { getTvdbApiKey } from "@/lib/integrations/app-settings";
import { isCacheHit, isStale } from "@/lib/tmdb/cache-policy";
import { pickPersonKnownFor, type KnownForCredit } from "@/lib/tmdb/known-for";

/** TMDb's Discover stops at page 500 (10,000 titles); no studio or network
 * comes close (Warner Bros. Pictures is ~160 pages, Netflix ~150). */
const CATALOG_MAX_PAGES = 500;
/** Pages fetched at once while walking a whole catalog: quick, and well
 * inside TMDb's rate limit. */
const CATALOG_CONCURRENCY = 8;
/** Pages of newest titles re-read daily between full refreshes, so a
 * studio's or network's new releases show up within a day. */
const TOP_UP_PAGES = 2;
const TOP_UP_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Set on a company's cached details once its catalog is the whole of it
 * (every page TMDb has), so catalogs saved when only the newest hundred
 * were kept refresh once. */
const FULL_CATALOG_MARKER = "marquee_full_catalog";
/** When the newest pages were last re-read (epoch ms), in the same place. */
const TOPPED_UP_AT = "marquee_topped_up_at";

function rawField(rawTmdb: unknown, key: string): unknown {
  return rawTmdb && typeof rawTmdb === "object" ? (rawTmdb as Record<string, unknown>)[key] : undefined;
}

/**
 * Every page of a Discover query: page 1 says how many there are, then the
 * rest a few at a time. A page that fails is skipped rather than failing
 * the whole catalog.
 */
async function fetchAllPages(
  fetchPage: (page: number) => Promise<tmdb.TmdbDiscoverResponse>,
  maxPages = CATALOG_MAX_PAGES,
): Promise<tmdb.TmdbDiscoverResult[]> {
  const first = await fetchPage(1);
  const last = Math.min(first.total_pages, maxPages);
  const results = [...first.results];
  for (let start = 2; start <= last; start += CATALOG_CONCURRENCY) {
    const batch = await Promise.all(
      Array.from({ length: Math.min(CATALOG_CONCURRENCY, last - start + 1) }, (_, i) =>
        fetchPage(start + i).catch(() => null),
      ),
    );
    for (const response of batch) results.push(...(response?.results ?? []));
  }
  return results;
}

/** A catalog's Discover results worth a card: one per title, and only
 * titles with a poster — the rest are mostly stubs nobody has filled in,
 * which show as blank cards. */
function withArtwork(results: tmdb.TmdbDiscoverResult[]): tmdb.TmdbDiscoverResult[] {
  const seen = new Set<number>();
  return results.filter((item) => item.poster_path && !seen.has(item.id) && seen.add(item.id));
}

function lightInput(mediaType: MediaType, item: tmdb.TmdbDiscoverResult): LightTitleInput {
  return {
    mediaType,
    tmdbId: item.id,
    name: item.title || item.name || "Untitled",
    overview: item.overview,
    posterPath: item.poster_path,
    backdropPath: item.backdrop_path,
    releaseDate: item.release_date,
    firstAirDate: item.first_air_date,
    voteCount: item.vote_count,
  };
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
  voteCount?: number | null;
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
    voteCount: input.voteCount ?? null,
    refreshedAt: new Date(),
  };
  const [row] = await db
    .insert(titles)
    .values(values)
    .onConflictDoUpdate({
      target: [titles.mediaType, titles.tmdbId],
      // A light save comes from a list (credits, a studio's catalog) that
      // often leaves fields out — a person's credits carry no backdrop, for
      // one — so it only ever fills gaps and never blanks what a full fetch
      // stored. It also leaves `refreshedAt` alone: bumping it here would
      // keep a popular title looking fresh forever, so its full details
      // (status, IDs) would never get re-fetched.
      set: {
        name: values.name,
        overview: sql`coalesce(${titles.overview}, excluded.overview)`,
        posterPath: sql`coalesce(excluded.poster_path, ${titles.posterPath})`,
        backdropPath: sql`coalesce(excluded.backdrop_path, ${titles.backdropPath})`,
        releaseDate: sql`coalesce(excluded.release_date, ${titles.releaseDate})`,
        firstAirDate: sql`coalesce(excluded.first_air_date, ${titles.firstAirDate})`,
        // Votes only grow, so the latest list's count wins.
        voteCount: sql`coalesce(excluded.vote_count, ${titles.voteCount})`,
      },
    })
    .returning();
  return row;
}

/**
 * upsertTitleLight for a whole list at once — a studio's catalog runs to
 * thousands of titles — in statements of a few hundred rows, with the same
 * fill-the-gaps-only rules. Returns the rows in no particular order.
 */
export async function upsertTitlesLight(inputs: LightTitleInput[]) {
  const unique = new Map<string, LightTitleInput>();
  for (const input of inputs) unique.set(`${input.mediaType}:${input.tmdbId}`, input);
  const all = [...unique.values()];
  const rows: (typeof titles.$inferSelect)[] = [];
  for (let i = 0; i < all.length; i += 500) {
    const now = new Date();
    const values = all.slice(i, i + 500).map((input) => ({
      mediaType: input.mediaType,
      tmdbId: input.tmdbId,
      name: input.name,
      overview: input.overview ?? null,
      posterPath: input.posterPath ?? null,
      backdropPath: input.backdropPath ?? null,
      releaseDate: input.releaseDate || null,
      firstAirDate: input.firstAirDate || null,
      voteCount: input.voteCount ?? null,
      refreshedAt: now,
    }));
    rows.push(
      ...(await db
        .insert(titles)
        .values(values)
        .onConflictDoUpdate({
          target: [titles.mediaType, titles.tmdbId],
          set: {
            name: sql`excluded.name`,
            overview: sql`coalesce(${titles.overview}, excluded.overview)`,
            posterPath: sql`coalesce(excluded.poster_path, ${titles.posterPath})`,
            backdropPath: sql`coalesce(excluded.backdrop_path, ${titles.backdropPath})`,
            releaseDate: sql`coalesce(excluded.release_date, ${titles.releaseDate})`,
            firstAirDate: sql`coalesce(excluded.first_air_date, ${titles.firstAirDate})`,
            voteCount: sql`coalesce(excluded.vote_count, ${titles.voteCount})`,
          },
        })
        .returning()),
    );
  }
  return rows;
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

  if (cached && isCacheHit(cached, Boolean(cached.rawTmdb))) {
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
      console.error("[tmdb-cache] refresh failed for %s/%s, serving stale cache:", mediaType, tmdbId, err);
      return cached;
    }
    throw err;
  }
}

/** A person cached before their details carried external_ids (and the
 * best-known title picked alongside them) is refreshed once, so the header's
 * artwork and links show up without waiting out the TTL. */
function predatesKnownFor(rawTmdb: unknown): boolean {
  return !rawTmdb || typeof rawTmdb !== "object" || !("external_ids" in rawTmdb);
}

function knownForCredit(item: tmdb.TmdbCreditItem): KnownForCredit {
  return {
    mediaType: item.media_type,
    tmdbId: item.id,
    name: item.title || item.name || "Untitled",
    backdropPath: item.backdrop_path ?? null,
    voteCount: item.vote_count ?? null,
    order: item.order ?? null,
    episodeCount: item.episode_count ?? null,
    character: item.character ?? null,
    department: item.department ?? null,
    job: item.job ?? null,
    genreIds: item.genre_ids ?? null,
  };
}

export async function getOrFetchPersonWithCredits(tmdbId: number) {
  const [cachedPerson] = await db.select().from(people).where(eq(people.tmdbId, tmdbId)).limit(1);

  if (!cachedPerson || isStale(cachedPerson.refreshedAt) || predatesKnownFor(cachedPerson.rawTmdb)) {
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

    // Replaced wholesale on each refresh: TMDb renames characters ("Mr.
    // Fantastic" → "Mister Fantastic"), and the unique key includes the
    // character, so keeping the old rows listed the same title twice.
    await db.delete(credits).where(and(eq(credits.personId, personRow.id), eq(credits.department, "Acting")));

    // Acting credits only (department/character-driven filmography); dedupe by media_type+id.
    const seen = new Map<string, string>();
    for (const item of combinedCredits.cast) {
      const key = `${item.media_type}:${item.id}`;
      if (seen.has(key)) continue;

      const titleRow = await upsertTitleLight({
        mediaType: item.media_type,
        tmdbId: item.id,
        name: item.title || item.name || "Untitled",
        overview: item.overview,
        posterPath: item.poster_path,
        backdropPath: item.backdrop_path,
        releaseDate: item.release_date,
        firstAirDate: item.first_air_date,
        voteCount: item.vote_count,
      });
      seen.set(key, titleRow.id);

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

    // The title behind their page's header, from the credits just fetched —
    // a director's comes from their crew credits, which aren't otherwise
    // kept, so that one title is saved here.
    const knownFor = pickPersonKnownFor({
      personName: details.name,
      knownForDepartment: details.known_for_department,
      cast: combinedCredits.cast.map(knownForCredit),
      crew: combinedCredits.crew.map(knownForCredit),
    });
    let knownForTitleId: string | null = null;
    if (knownFor) {
      knownForTitleId = seen.get(`${knownFor.mediaType}:${knownFor.tmdbId}`) ?? null;
      if (!knownForTitleId) {
        const item = combinedCredits.crew.find((c) => c.media_type === knownFor.mediaType && c.id === knownFor.tmdbId);
        const titleRow = await upsertTitleLight({
          mediaType: knownFor.mediaType,
          tmdbId: knownFor.tmdbId,
          name: knownFor.name,
          overview: item?.overview,
          posterPath: item?.poster_path,
          backdropPath: knownFor.backdropPath,
          releaseDate: item?.release_date,
          firstAirDate: item?.first_air_date,
          voteCount: knownFor.voteCount,
        });
        knownForTitleId = titleRow.id;
      }
    }
    await db.update(people).set({ knownForTitleId }).where(eq(people.id, personRow.id));

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
  const [knownFor] = person?.knownForTitleId
    ? await db.select().from(titles).where(eq(titles.id, person.knownForTitleId)).limit(1)
    : [];

  // One entry per title, even for rows saved before refreshes replaced them.
  const seenTitles = new Set<string>();
  const unique = filmography.filter(({ title }) => !seenTitles.has(title.id) && seenTitles.add(title.id));

  return { person, filmography: unique, knownFor: knownFor ?? null };
}

/**
 * A studio and its whole catalog — every movie and series TMDb credits it
 * with that has a poster — kept in the database. Re-read in full when the
 * details go stale (cache-policy's TTL); between those, the newest couple
 * of pages are re-read once a day so new releases show up.
 */
export async function getOrFetchCompanyWithCatalog(tmdbId: number) {
  const [cachedCompany] = await db
    .select()
    .from(companies)
    .where(eq(companies.tmdbId, tmdbId))
    .limit(1);

  if (cachedCompany && !isStale(cachedCompany.refreshedAt) && rawField(cachedCompany.rawTmdb, FULL_CATALOG_MARKER)) {
    const toppedUpAt = Number(rawField(cachedCompany.rawTmdb, TOPPED_UP_AT) ?? 0);
    if (Date.now() - toppedUpAt > TOP_UP_INTERVAL_MS) {
      await topUpCompany(cachedCompany.id, tmdbId, cachedCompany.rawTmdb).catch((err) =>
        console.error("[tmdb] couldn't re-read company %d's newest titles:", tmdbId, err),
      );
    }
    return getCompanyWithCatalogFromDb(cachedCompany.id);
  }

  const details = await tmdb.getCompanyDetails(tmdbId);
  const [movies, series] = await Promise.all([
    fetchAllPages((page) => tmdb.discoverMoviesByCompany(tmdbId, page)),
    fetchAllPages((page) => tmdb.discoverTvByCompany(tmdbId, page)),
  ]);

  const rawTmdb = { ...details, [FULL_CATALOG_MARKER]: true, [TOPPED_UP_AT]: Date.now() };
  const [companyRow] = await db
    .insert(companies)
    .values({
      tmdbId,
      name: details.name,
      description: details.description || null,
      logoPath: details.logo_path,
      originCountry: details.origin_country,
      parentCompanyTmdbId: details.parent_company?.id ?? null,
      rawTmdb,
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
        rawTmdb,
        refreshedAt: new Date(),
      },
    })
    .returning();

  await linkCompanyTitles(companyRow.id, [
    ...withArtwork(movies).map((item) => lightInput("movie", item)),
    ...withArtwork(series).map((item) => lightInput("tv", item)),
  ]);

  return getCompanyWithCatalogFromDb(companyRow.id);
}

/** Re-reads a studio's newest pages and adds what's new. */
async function topUpCompany(companyId: string, tmdbId: number, rawTmdb: unknown) {
  const pages = Array.from({ length: TOP_UP_PAGES }, (_, i) => i + 1);
  const [movies, series] = await Promise.all([
    Promise.all(pages.map((page) => tmdb.discoverMoviesByCompany(tmdbId, page))),
    Promise.all(pages.map((page) => tmdb.discoverTvByCompany(tmdbId, page))),
  ]);
  await linkCompanyTitles(companyId, [
    ...withArtwork(movies.flatMap((r) => r.results)).map((item) => lightInput("movie", item)),
    ...withArtwork(series.flatMap((r) => r.results)).map((item) => lightInput("tv", item)),
  ]);
  await db
    .update(companies)
    .set({ rawTmdb: { ...(rawTmdb as object), [TOPPED_UP_AT]: Date.now() } })
    .where(eq(companies.id, companyId));
}

async function linkCompanyTitles(companyId: string, inputs: LightTitleInput[]) {
  const rows = await upsertTitlesLight(inputs);
  for (let i = 0; i < rows.length; i += 1000) {
    await db
      .insert(companyTitles)
      .values(rows.slice(i, i + 1000).map((row) => ({ companyId, titleId: row.id })))
      .onConflictDoNothing();
  }
}

async function getCompanyWithCatalogFromDb(companyId: string) {
  const [company] = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1);
  const catalog = await db
    .select({ title: titles })
    .from(companyTitles)
    .innerJoin(titles, eq(companyTitles.titleId, titles.id))
    // Titles saved before posterless ones were left out stay linked; they
    // aren't shown.
    .where(and(eq(companyTitles.companyId, companyId), isNotNull(titles.posterPath)))
    .orderBy(sql`coalesce(${titles.releaseDate}, ${titles.firstAirDate}) desc nulls last`);

  return { company, catalog: catalog.map((row) => row.title) };
}

/** How long a network's catalog is reused before TMDb is asked again. */
const NETWORK_CATALOG_TTL_MS = 6 * 60 * 60 * 1000;
const networkCatalogs = new Map<number, { at: number; network: tmdb.TmdbNetworkDetails; catalog: TitleRow[] }>();

type TitleRow = typeof titles.$inferSelect;

/**
 * A network's page (app/network/[id]): its details and every series TMDb
 * lists for it that has a poster, saved as light titles. Unlike a studio's,
 * kept in memory only (a network is browsed, not favorited), for a few
 * hours. Throws when TMDb has no such network.
 */
export async function getNetworkWithCatalog(tmdbId: number) {
  const cached = networkCatalogs.get(tmdbId);
  if (cached && Date.now() - cached.at < NETWORK_CATALOG_TTL_MS) return cached;

  const network = await tmdb.getNetworkDetails(tmdbId);
  const series = await fetchAllPages((page) => tmdb.discoverTvByNetwork(tmdbId, "first_air_date.desc", page));
  const catalog = await upsertTitlesLight(withArtwork(series).map((item) => lightInput("tv", item)));
  // Newest first, as a studio's: titles with no date yet go last.
  catalog.sort((a, b) => (b.firstAirDate ?? "").localeCompare(a.firstAirDate ?? ""));

  const entry = { at: Date.now(), network, catalog };
  networkCatalogs.set(tmdbId, entry);
  return entry;
}
