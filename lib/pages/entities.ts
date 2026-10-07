import { getOrFetchPersonWithCredits, getOrFetchCompanyWithCatalog, getNetworkWithCatalog } from "@/lib/tmdb/cache";
import { findGroupForCompanyId } from "@/lib/tmdb/company-groups";
import { getEpisodeCountMap, getLibraryStatusMap } from "@/lib/library/query";
import type { EpisodeCounts } from "@/lib/library/episode-counts";
import { getArrCredential, isArrFullyConfigured } from "@/lib/integrations/credentials";
import { isFavorited, getFavoritedTmdbIds } from "@/lib/favorites/query";
import type { ViewerIdentity } from "@/lib/integrations/library-owner";
import type { LibraryStatus } from "@/components/status-badge";
import type { MediaType, titles } from "@/lib/db/schema";
import { pickCatalogKnownFor } from "@/lib/tmdb/known-for";
import { buildEntityLinks, type EntityLink, type TmdbPersonExternalIds } from "@/lib/tmdb/entity-links";
import { getLocale } from "@/lib/i18n/server";
import type { Locale } from "@/lib/i18n/locales";
import { contentLanguageFor, getLocalizedPerson } from "@/lib/tmdb/client";
import { getSavedTranslations, saveLightTranslations } from "@/lib/tmdb/translations";
import { overlayCard, pick, type TitleTranslation } from "@/lib/tmdb/language";

// Person (/person/[id]), studio (/company/[id]) and network (/network/[id])
// page data — shared with GET /api/v1/people/[id], /companies/[id] and
// /networks/[id].

type TitleRow = typeof titles.$inferSelect;

/** One row of a person's filmography or a studio's catalog. Structurally the
 * same shape components/media-list.tsx's MediaEntry takes. */
export type EntityMediaEntry = {
  titleId: string;
  mediaType: MediaType;
  tmdbId: number;
  name: string;
  posterPath: string | null;
  year: string | null;
  subtitle?: string | null;
  status?: LibraryStatus;
  /** Series in the library: have/total aired episodes. */
  episodes?: EpisodeCounts | null;
};

/** The title a person or studio is best known for: its backdrop goes behind
 * the page's header, with a "From …" link to it (lib/tmdb/known-for.ts). */
export type KnownForTitle = {
  mediaType: MediaType;
  tmdbId: number;
  name: string;
  backdropPath: string;
};

function knownForTitle(title: TitleRow | null | undefined): KnownForTitle | null {
  if (!title?.backdropPath) return null;
  return { mediaType: title.mediaType, tmdbId: title.tmdbId, name: title.name, backdropPath: title.backdropPath };
}

type CardTranslation = Pick<TitleTranslation, "name" | "posterPath">;

/**
 * A person's biography and credits in the viewer's language: one TMDb call
 * (its answer cached an hour like every other), whose names and posters
 * are also saved as light translations for the database's own lists. Null
 * for English; when TMDb can't be reached, whatever translations are
 * saved already.
 */
async function personInLanguage(
  locale: Locale,
  tmdbId: number,
  filmography: { title: TitleRow }[],
): Promise<{ biography: string | null; cards: Map<string, CardTranslation> } | null> {
  if (locale === "en") return null;
  const localized = await contentLanguageFor(locale)
    .then((language) => getLocalizedPerson(tmdbId, language))
    .catch(() => null);
  if (!localized) {
    const saved = await getSavedTranslations(
      filmography.map(({ title }) => title.id),
      locale,
    ).catch(() => new Map<string, TitleTranslation>());
    return { biography: null, cards: saved };
  }
  const byKey = new Map(
    [...(localized.combined_credits?.cast ?? []), ...(localized.combined_credits?.crew ?? [])].map((item) => [
      `${item.media_type}:${item.id}`,
      item,
    ]),
  );
  // Only what's new is written: the page is opened far more often than
  // TMDb's answer changes.
  const saved = await getSavedTranslations(
    filmography.map(({ title }) => title.id),
    locale,
  ).catch(() => new Map<string, TitleTranslation>());
  const cards = new Map<string, CardTranslation>();
  const light: { titleId: string; name: string | null; overview: string | null; posterPath: string | null }[] = [];
  for (const { title } of filmography) {
    const item = byKey.get(`${title.mediaType}:${title.tmdbId}`);
    if (!item) continue;
    const translation = { name: item.title || item.name || null, posterPath: item.poster_path };
    cards.set(title.id, translation);
    const known = saved.get(title.id);
    if (known && (known.details || (known.name === translation.name && known.posterPath === translation.posterPath))) continue;
    light.push({ titleId: title.id, ...translation, overview: item.overview || null });
  }
  await saveLightTranslations(locale, light).catch((err) =>
    console.error("[tmdb-translations] couldn't save a person's credits in %s:", locale, err),
  );
  return { biography: localized.biography || null, cards };
}

/** TMDb's homepage and external_ids as saved in a person's or company's
 * raw details. */
function linksFromRaw(raw: unknown): EntityLink[] {
  if (!raw || typeof raw !== "object") return [];
  const details = raw as { homepage?: unknown; external_ids?: unknown };
  return buildEntityLinks({
    homepage: typeof details.homepage === "string" ? details.homepage : null,
    externalIds:
      details.external_ids && typeof details.external_ids === "object"
        ? (details.external_ids as TmdbPersonExternalIds)
        : null,
  });
}

/** Fills in each series' episode count, and returns which entries the
 * viewer has favorited ("movie:603"). */
async function enrichEntries(viewer: ViewerIdentity, entries: EntityMediaEntry[]) {
  if (viewer.libraryOwnerId) {
    const episodeCounts = await getEpisodeCountMap(viewer.libraryOwnerId, entries);
    for (const entry of entries) entry.episodes = episodeCounts.get(`${entry.mediaType}:${entry.tmdbId}`) ?? null;
  }
  const [favoritedMovieIds, favoritedTvIds] = viewer.userId
    ? await Promise.all([
        getFavoritedTmdbIds(
          viewer.userId,
          "movie",
          entries.filter((e) => e.mediaType === "movie").map((e) => e.tmdbId),
        ),
        getFavoritedTmdbIds(
          viewer.userId,
          "tv",
          entries.filter((e) => e.mediaType === "tv").map((e) => e.tmdbId),
        ),
      ])
    : [new Set<number>(), new Set<number>()];
  return new Set([
    ...[...favoritedMovieIds].map((id) => `movie:${id}`),
    ...[...favoritedTvIds].map((id) => `tv:${id}`),
  ]);
}

/** Returns null when TMDb has no such person (the page's notFound()). */
export async function loadPersonPage(viewer: ViewerIdentity, tmdbId: number) {
  const { person, filmography, knownFor } = await getOrFetchPersonWithCredits(tmdbId).catch(() => ({
    person: undefined,
    filmography: [],
    knownFor: null,
  }));

  if (!person) return null;

  const inLanguage = await personInLanguage(await getLocale(), tmdbId, filmography);

  const [statusMap, radarrCredential, sonarrCredential, favorited] = viewer.libraryOwnerId
    ? await Promise.all([
        getLibraryStatusMap(
          viewer.libraryOwnerId,
          filmography.map(({ title }) => ({ mediaType: title.mediaType, tmdbId: title.tmdbId })),
        ),
        getArrCredential(viewer.userId, "radarr"),
        getArrCredential(viewer.userId, "sonarr"),
        isFavorited(viewer.userId, "person", tmdbId),
      ])
    : [new Map<string, LibraryStatus>(), null, null, false];

  const entries: EntityMediaEntry[] = filmography.map(({ credit, title }) =>
    overlayCard(
      {
        titleId: title.id,
        mediaType: title.mediaType,
        tmdbId: title.tmdbId,
        name: title.name,
        posterPath: title.posterPath,
        year: (title.releaseDate || title.firstAirDate || "").slice(0, 4) || null,
        subtitle: credit.characterName,
        status: statusMap.get(`${title.mediaType}:${title.tmdbId}`),
      },
      inLanguage?.cards.get(title.id),
    ),
  );

  const favoritedKeys = await enrichEntries(viewer, entries);
  const shownKnownFor = knownForTitle(knownFor);

  return {
    // The biography in the viewer's language when TMDb has one; the rest of
    // the person (name, dates, links) is the same in every language.
    person: inLanguage?.biography ? { ...person, biography: inLanguage.biography } : person,
    knownFor:
      shownKnownFor && knownFor
        ? { ...shownKnownFor, name: pick(inLanguage?.cards.get(knownFor.id)?.name, shownKnownFor.name) }
        : shownKnownFor,
    links: linksFromRaw(person.rawTmdb),
    entries,
    favorited: favorited as boolean,
    favoritedKeys,
    arrConfigured: {
      movie: isArrFullyConfigured(radarrCredential),
      tv: isArrFullyConfigured(sonarrCredential),
    },
  };
}

/** Returns null when TMDb has no such company (the page's notFound()). */
export async function loadCompanyPage(viewer: ViewerIdentity, tmdbId: number) {
  const group = findGroupForCompanyId(tmdbId);

  let name: string;
  let description: string | null;
  let logoPath: string | null;
  let rawTmdb: unknown;
  let catalog: TitleRow[];

  if (group) {
    const results = await Promise.all(
      group.memberIds.map((memberId) => getOrFetchCompanyWithCatalog(memberId).catch(() => null)),
    );
    const valid = results.filter((r): r is NonNullable<typeof r> => Boolean(r?.company));
    if (valid.length === 0) return null;

    const primary = valid.find((r) => r.company.tmdbId === group.memberIds[0]) ?? valid[0];

    name = group.displayName;
    description = primary.company.description;
    logoPath = primary.company.logoPath;
    rawTmdb = primary.company.rawTmdb;

    const seen = new Set<string>();
    catalog = [];
    for (const result of valid) {
      for (const title of result.catalog) {
        const key = `${title.mediaType}:${title.tmdbId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        catalog.push(title);
      }
    }
  } else {
    const solo = await getOrFetchCompanyWithCatalog(tmdbId).catch(() => ({
      company: undefined,
      catalog: [] as TitleRow[],
    }));
    if (!solo.company) return null;
    name = solo.company.name;
    description = solo.company.description;
    logoPath = solo.company.logoPath;
    rawTmdb = solo.company.rawTmdb;
    catalog = solo.catalog;
  }

  // The names and posters saved in the viewer's language (a studio's
  // catalog is too long to ask TMDb for title by title); English for the
  // rest. The order stays the English catalog's.
  const translations = await getSavedTranslations(
    catalog.map((title) => title.id),
    await getLocale(),
  ).catch(() => new Map<string, TitleTranslation>());

  const [statusMap, radarrCredential, sonarrCredential, favorited] = viewer.libraryOwnerId
    ? await Promise.all([
        getLibraryStatusMap(
          viewer.libraryOwnerId,
          catalog.map((title) => ({ mediaType: title.mediaType, tmdbId: title.tmdbId })),
        ),
        getArrCredential(viewer.userId, "radarr"),
        getArrCredential(viewer.userId, "sonarr"),
        isFavorited(viewer.userId, "company", tmdbId),
      ])
    : [new Map<string, LibraryStatus>(), null, null, false];

  const entries: EntityMediaEntry[] = catalog.map((title) =>
    overlayCard(
      {
        titleId: title.id,
        mediaType: title.mediaType,
        tmdbId: title.tmdbId,
        name: title.name,
        posterPath: title.posterPath,
        year: (title.releaseDate || title.firstAirDate || "").slice(0, 4) || null,
        status: statusMap.get(`${title.mediaType}:${title.tmdbId}`),
      },
      translations.get(title.id),
    ),
  );

  const favoritedKeys = await enrichEntries(viewer, entries);
  const catalogKnownFor = pickCatalogKnownFor(catalog);
  const shownKnownFor = knownForTitle(catalogKnownFor);

  return {
    company: { name, description, logoPath, count: catalog.length },
    knownFor:
      shownKnownFor && catalogKnownFor
        ? { ...shownKnownFor, name: pick(translations.get(catalogKnownFor.id)?.name, shownKnownFor.name) }
        : shownKnownFor,
    // A studio has no socials on TMDb; only its own website, when listed.
    links: linksFromRaw(rawTmdb).filter((link) => link.kind === "homepage"),
    entries,
    favorited: favorited as boolean,
    favoritedKeys,
    arrConfigured: {
      movie: isArrFullyConfigured(radarrCredential),
      tv: isArrFullyConfigured(sonarrCredential),
    },
  };
}

/** Returns null when TMDb has no such network (the page's notFound()). The
 * same header and list as a studio's, without a favorite. */
export async function loadNetworkPage(viewer: ViewerIdentity, tmdbId: number) {
  const loaded = await getNetworkWithCatalog(tmdbId).catch(() => null);
  if (!loaded) return null;
  const { network, catalog } = loaded;

  const translations = await getSavedTranslations(
    catalog.map((title) => title.id),
    await getLocale(),
  ).catch(() => new Map<string, TitleTranslation>());

  const [statusMap, radarrCredential, sonarrCredential] = viewer.libraryOwnerId
    ? await Promise.all([
        getLibraryStatusMap(
          viewer.libraryOwnerId,
          catalog.map((title) => ({ mediaType: title.mediaType, tmdbId: title.tmdbId })),
        ),
        getArrCredential(viewer.userId, "radarr"),
        getArrCredential(viewer.userId, "sonarr"),
      ])
    : [new Map<string, LibraryStatus>(), null, null];

  const entries: EntityMediaEntry[] = catalog.map((title) =>
    overlayCard(
      {
        titleId: title.id,
        mediaType: title.mediaType,
        tmdbId: title.tmdbId,
        name: title.name,
        posterPath: title.posterPath,
        year: (title.releaseDate || title.firstAirDate || "").slice(0, 4) || null,
        status: statusMap.get(`${title.mediaType}:${title.tmdbId}`),
      },
      translations.get(title.id),
    ),
  );

  const favoritedKeys = await enrichEntries(viewer, entries);
  const catalogKnownFor = pickCatalogKnownFor(catalog);
  const shownKnownFor = knownForTitle(catalogKnownFor);

  return {
    network: { name: network.name, logoPath: network.logo_path, count: catalog.length },
    knownFor:
      shownKnownFor && catalogKnownFor
        ? { ...shownKnownFor, name: pick(translations.get(catalogKnownFor.id)?.name, shownKnownFor.name) }
        : shownKnownFor,
    links: buildEntityLinks({ homepage: network.homepage || null, externalIds: null }).filter(
      (link) => link.kind === "homepage",
    ),
    entries,
    favoritedKeys,
    arrConfigured: {
      movie: isArrFullyConfigured(radarrCredential),
      tv: isArrFullyConfigured(sonarrCredential),
    },
  };
}
