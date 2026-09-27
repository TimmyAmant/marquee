import {
  getArrCredential,
  getJellyfinCredential,
  getPlexCredential,
  isArrFullyConfigured,
} from "@/lib/integrations/credentials";
import type { ViewerIdentity } from "@/lib/integrations/library-owner";
import { getStorageOverview, type StorageOverview } from "@/lib/integrations/disk-space";
import { getUserLibrary, getLibraryStatusMap, summarizeLibrary, type LibraryItem, type LibrarySummary } from "@/lib/library/query";
import { getIncompleteCollections, type IncompleteCollection } from "@/lib/library/collections";
import { getLibraryDuplicates, type DuplicateGroup } from "@/lib/library/duplicates";
import { libraryFilterOptions, queryLibrary, type LibraryFilterOptions, type LibraryPage, type LibraryQuery } from "@/lib/library/list";
import type { LibraryStatus } from "@/lib/library/status-tone";
import { getFavoritedTmdbIds, isFavorited } from "@/lib/favorites/query";
import { getActiveRequestStatusMap } from "@/lib/requests/query";
import { getBlockedTitleKeys } from "@/lib/requests/blocklist";
import { getAccess } from "@/lib/users/access";
import { NO_PERMISSIONS, permissionMap, type PermissionMap } from "@/lib/users/permissions";
import type { RequestStatus } from "@/lib/db/schema";

// Everything /library shows — shared with GET /api/v1/library and its
// /collections-missing, /duplicates and /storage siblings. A signed-in
// viewer sees the household library (viewer.libraryOwnerId), exactly as
// every other page does.

type SignedIn = Extract<ViewerIdentity, { userId: string }>;

export type LibraryConnections = {
  plex: boolean;
  jellyfin: boolean;
  sonarr: boolean;
  radarr: boolean;
  /** Radarr (movies) / Sonarr (TV) has a root folder and quality profile —
   * whether "Add" can be offered. */
  arrConfigured: { movie: boolean; tv: boolean };
  any: boolean;
};

export async function loadLibraryConnections(libraryOwnerId: string): Promise<LibraryConnections> {
  const [plex, jellyfin, sonarr, radarr] = await Promise.all([
    getPlexCredential(libraryOwnerId),
    getJellyfinCredential(libraryOwnerId),
    getArrCredential(libraryOwnerId, "sonarr"),
    getArrCredential(libraryOwnerId, "radarr"),
  ]);
  return {
    plex: Boolean(plex),
    jellyfin: Boolean(jellyfin),
    sonarr: Boolean(sonarr),
    radarr: Boolean(radarr),
    arrConfigured: { movie: isArrFullyConfigured(radarr), tv: isArrFullyConfigured(sonarr) },
    any: Boolean(plex || jellyfin || sonarr || radarr),
  };
}

export type LibraryPageData = {
  page: LibraryPage;
  summary: LibrarySummary;
  filters: LibraryFilterOptions;
  connections: LibraryConnections;
  /** Which of the page's titles the viewer has favorited ("movie:603"). */
  favoritedKeys: Set<string>;
};

/** The main tab: the filtered, sorted page plus the header counts and the
 * filter choices (worked out from the whole library, not the page). */
export async function loadLibraryPage(viewer: SignedIn, query: LibraryQuery): Promise<LibraryPageData> {
  const [library, connections] = await Promise.all([
    getUserLibrary(viewer.libraryOwnerId),
    loadLibraryConnections(viewer.libraryOwnerId),
  ]);
  const page = queryLibrary(library, query);
  const [movieFavorites, tvFavorites] = await Promise.all([
    getFavoritedTmdbIds(viewer.userId, "movie", page.results.filter((i) => i.mediaType === "movie").map((i) => i.tmdbId)),
    getFavoritedTmdbIds(viewer.userId, "tv", page.results.filter((i) => i.mediaType === "tv").map((i) => i.tmdbId)),
  ]);
  const favoritedKeys = new Set([
    ...[...movieFavorites].map((id) => `movie:${id}`),
    ...[...tvFavorites].map((id) => `tv:${id}`),
  ]);
  return { page, summary: summarizeLibrary(library), filters: libraryFilterOptions(library), connections, favoritedKeys };
}

export type CollectionWithState = IncompleteCollection & {
  statusMap: Map<string, LibraryStatus>;
  requestStatusMap: Map<string, RequestStatus>;
  favoritedIds: Set<number>;
  collectionFavorited: boolean;
};

export type LibraryCollectionsData = {
  collections: CollectionWithState[];
  connections: LibraryConnections;
  permissions: PermissionMap;
  blockedKeys: Set<string>;
};

/** The "Missing from collections" tab, with what each poster needs: its
 * status, the viewer's own request, favorites, and the blocklist. */
export async function loadLibraryCollections(viewer: SignedIn): Promise<LibraryCollectionsData> {
  const [collections, connections, access, blockedKeys] = await Promise.all([
    getIncompleteCollections(viewer.libraryOwnerId),
    loadLibraryConnections(viewer.libraryOwnerId),
    getAccess(viewer.userId).catch(() => null),
    getBlockedTitleKeys().catch(() => new Set<string>()),
  ]);
  const permissions = access ? permissionMap(access) : NO_PERMISSIONS;

  const withState = await Promise.all(
    collections.map(async (collection): Promise<CollectionWithState> => {
      const refs = collection.items.map((i) => ({ mediaType: i.mediaType, tmdbId: i.tmdbId }));
      const mediaType = collection.items[0]?.mediaType ?? "movie";
      const [statusMap, requestStatusMap, favoritedIds, collectionFavorited] = await Promise.all([
        getLibraryStatusMap(viewer.libraryOwnerId, refs),
        getActiveRequestStatusMap(viewer.userId, refs),
        getFavoritedTmdbIds(viewer.userId, mediaType, collection.items.map((i) => i.tmdbId)),
        collection.collectionId !== undefined ? isFavorited(viewer.userId, "collection", collection.collectionId) : Promise.resolve(false),
      ]);
      return { ...collection, statusMap, requestStatusMap, favoritedIds, collectionFavorited };
    }),
  );
  return { collections: withState, connections, permissions, blockedKeys };
}

/** The Duplicates tab — the caller checks the viewer is the admin. */
export function loadLibraryDuplicates(viewer: SignedIn): Promise<DuplicateGroup[]> {
  return getLibraryDuplicates(viewer.libraryOwnerId);
}

/** The Storage card. */
export function loadLibraryStorage(viewer: SignedIn): Promise<StorageOverview> {
  return getStorageOverview(viewer.libraryOwnerId);
}

export type { LibraryItem };
