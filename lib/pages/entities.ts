import { getOrFetchPersonWithCredits, getOrFetchCompanyWithCatalog } from "@/lib/tmdb/cache";
import { findGroupForCompanyId } from "@/lib/tmdb/company-groups";
import { getLibraryStatusMap } from "@/lib/library/query";
import { getArrCredential, isArrFullyConfigured } from "@/lib/integrations/credentials";
import { isFavorited, getFavoritedTmdbIds } from "@/lib/favorites/query";
import type { ViewerIdentity } from "@/lib/integrations/library-owner";
import type { LibraryStatus } from "@/components/status-badge";
import type { MediaType, titles } from "@/lib/db/schema";
import { pickCatalogKnownFor } from "@/lib/tmdb/known-for";
import { buildEntityLinks, type EntityLink, type TmdbPersonExternalIds } from "@/lib/tmdb/entity-links";

// Person (/person/[id]) and studio (/company/[id]) page data — shared with
// GET /api/v1/people/[id] and GET /api/v1/companies/[id].

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

async function enrichEntries(viewer: ViewerIdentity, entries: EntityMediaEntry[]) {
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

  const entries: EntityMediaEntry[] = filmography.map(({ credit, title }) => ({
    titleId: title.id,
    mediaType: title.mediaType,
    tmdbId: title.tmdbId,
    name: title.name,
    posterPath: title.posterPath,
    year: (title.releaseDate || title.firstAirDate || "").slice(0, 4) || null,
    subtitle: credit.characterName,
    status: statusMap.get(`${title.mediaType}:${title.tmdbId}`),
  }));

  const favoritedKeys = await enrichEntries(viewer, entries);

  return {
    person,
    knownFor: knownForTitle(knownFor),
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

  const entries: EntityMediaEntry[] = catalog.map((title) => ({
    titleId: title.id,
    mediaType: title.mediaType,
    tmdbId: title.tmdbId,
    name: title.name,
    posterPath: title.posterPath,
    year: (title.releaseDate || title.firstAirDate || "").slice(0, 4) || null,
    status: statusMap.get(`${title.mediaType}:${title.tmdbId}`),
  }));

  const favoritedKeys = await enrichEntries(viewer, entries);

  return {
    company: { name, description, logoPath, count: catalog.length },
    knownFor: knownForTitle(pickCatalogKnownFor(catalog)),
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
