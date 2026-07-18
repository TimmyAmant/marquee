import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  getArrCredential,
  getPlexCredential,
  getJellyfinCredential,
  isArrFullyConfigured,
} from "@/lib/integrations/credentials";
import { syncPlexLibraryIfStale } from "@/lib/plex/sync";
import { syncJellyfinLibraryIfStale } from "@/lib/jellyfin/sync";
import { syncArrLibraryIfStale } from "@/lib/arr/sync";
import { getUserLibrary, getLibraryStatusMap } from "@/lib/library/query";
import { getIncompleteFranchises } from "@/lib/library/franchises";
import { MediaList, type MediaEntry } from "@/components/media-list";
import { FranchiseRow } from "@/components/franchise-row";
import { SearchBar } from "@/components/search-bar";
import { formatBytes } from "@/lib/format";
import { getFavoritedTmdbIds, isFavorited } from "@/lib/favorites/query";
import { getDiskSpaceSummary } from "@/lib/integrations/disk-space";
import { getViewerContext } from "@/lib/integrations/library-owner";

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const viewer = await getViewerContext();
  if (!viewer.session) redirect("/login");

  const userId = viewer.userId;
  const isAdmin = viewer.isAdmin;
  const libraryOwnerId = viewer.libraryOwnerId;
  const tab = (await searchParams).tab === "missing" ? "missing" : "all";

  const [plexCred, jellyfinCred, sonarrCred, radarrCred] = await Promise.all([
    getPlexCredential(libraryOwnerId),
    getJellyfinCredential(libraryOwnerId),
    getArrCredential(libraryOwnerId, "sonarr"),
    getArrCredential(libraryOwnerId, "radarr"),
  ]);

  const anyConnected = Boolean(plexCred || jellyfinCred || sonarrCred || radarrCred);

  if (!anyConnected) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-20 text-center">
        <h1 className="font-display text-3xl text-text-primary">My Library</h1>
        <p className="mt-3 text-text-secondary">
          {libraryOwnerId === userId
            ? "Connect Plex, Jellyfin, Sonarr, or Radarr to see everything you already own in one place."
            : "The household admin hasn't connected Plex, Jellyfin, Sonarr, or Radarr yet."}
        </p>
        {libraryOwnerId === userId && (
          <Link
            href="/settings/integrations"
            className="mt-6 inline-block rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-bg-0 transition-colors hover:bg-accent-hover"
          >
            Connect an integration
          </Link>
        )}
      </div>
    );
  }

  const [, , , diskSpace] = await Promise.all([
    syncPlexLibraryIfStale(libraryOwnerId),
    syncJellyfinLibraryIfStale(libraryOwnerId),
    syncArrLibraryIfStale(libraryOwnerId),
    getDiskSpaceSummary(libraryOwnerId).catch(() => []),
  ]);
  const totalFreeBytes = diskSpace.reduce((sum, d) => sum + d.freeSpace, 0);

  const library = await getUserLibrary(libraryOwnerId);
  const owned = library.filter((i) => i.status === "owned");
  const summary = {
    movieCount: owned.filter((i) => i.mediaType === "movie").length,
    tvCount: owned.filter((i) => i.mediaType === "tv").length,
    totalBytes: owned.reduce((sum, i) => sum + (i.sizeBytes ?? 0), 0),
    trackedCount: library.length - owned.length,
  };

  const entries: MediaEntry[] = library.map((item) => ({
    titleId: item.titleId,
    mediaType: item.mediaType,
    tmdbId: item.tmdbId,
    name: item.name,
    posterPath: item.posterPath,
    year: item.year,
    status: item.status,
    source: item.source,
    sizeBytes: item.sizeBytes,
    addedAt: item.addedAt ? item.addedAt.toISOString() : null,
    monitored: item.monitored,
    filePath: item.filePath,
    qualityCutoffNotMet: item.qualityCutoffNotMet,
    qualityName: item.qualityName,
  }));

  const [favoritedMovieIds, favoritedTvIds] = await Promise.all([
    getFavoritedTmdbIds(
      userId,
      "movie",
      entries.filter((e) => e.mediaType === "movie").map((e) => e.tmdbId),
    ),
    getFavoritedTmdbIds(
      userId,
      "tv",
      entries.filter((e) => e.mediaType === "tv").map((e) => e.tmdbId),
    ),
  ]);
  const favoritedKeys = new Set([
    ...[...favoritedMovieIds].map((id) => `movie:${id}`),
    ...[...favoritedTvIds].map((id) => `tv:${id}`),
  ]);

  const arrConfigured = { movie: isArrFullyConfigured(radarrCred), tv: isArrFullyConfigured(sonarrCred) };

  // Only walked for the "Missing from collections" tab — each franchise
  // needs its own status map (live TMDb collection fetches aren't cheap
  // enough to do unconditionally on every My Library page load).
  const franchises = tab === "missing" ? await getIncompleteFranchises(libraryOwnerId) : [];
  const franchiseExtras = await Promise.all(
    franchises.map(async (franchise) => {
      const [statusMap, favoritedIds, collectionFavorited] = await Promise.all([
        getLibraryStatusMap(
          libraryOwnerId,
          franchise.items.map((i) => ({ mediaType: i.mediaType, tmdbId: i.tmdbId })),
        ),
        getFavoritedTmdbIds(userId, franchise.items[0]?.mediaType ?? "movie", franchise.items.map((i) => i.tmdbId)),
        franchise.collectionId !== undefined
          ? isFavorited(userId, "collection", franchise.collectionId)
          : Promise.resolve(false),
      ]);
      return { statusMap, favoritedIds, collectionFavorited };
    }),
  );

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl text-text-primary">My Library</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Everything already in your connected Plex, Jellyfin, Sonarr, and Radarr.
          </p>
        </div>
        <div className="w-full sm:w-80">
          <SearchBar variant="compact" />
        </div>
      </div>

      <div className="mt-6 flex gap-2">
        <Link
          href="/library"
          className={`rounded-full px-4 py-1.5 text-sm transition-colors ${
            tab === "all"
              ? "bg-accent text-bg-0"
              : "text-text-secondary hover:bg-bg-1 hover:text-text-primary"
          }`}
        >
          My Library
        </Link>
        <Link
          href="/library?tab=missing"
          className={`rounded-full px-4 py-1.5 text-sm transition-colors ${
            tab === "missing"
              ? "bg-accent text-bg-0"
              : "text-text-secondary hover:bg-bg-1 hover:text-text-primary"
          }`}
        >
          Missing from collections
        </Link>
      </div>

      {tab === "missing" ? (
        <div className="mt-8 flex flex-col gap-10">
          {franchises.length === 0 ? (
            <p className="text-sm text-text-muted">
              Nothing incomplete — every franchise you own at least one part of is fully owned, or
              you don&apos;t own any titles that belong to one yet.
            </p>
          ) : (
            franchises.map((franchise, i) => (
              <FranchiseRow
                key={franchise.key}
                title={franchise.title}
                items={franchise.items}
                statusMap={franchiseExtras[i].statusMap}
                favoritedIds={franchiseExtras[i].favoritedIds}
                showFavorite
                arrConfigured={arrConfigured}
                collectionId={franchise.collectionId}
                collectionFavorited={franchiseExtras[i].collectionFavorited}
              />
            ))
          )}
        </div>
      ) : (
        <>
          <div className="mt-6 rounded-2xl border border-border bg-bg-1 px-6 py-4">
            <div className="flex flex-wrap gap-6 text-sm">
              <div>
                <span className="font-display text-2xl text-text-primary">{summary.movieCount}</span>
                <span className="ml-1.5 text-text-muted">movies</span>
              </div>
              <div>
                <span className="font-display text-2xl text-text-primary">{summary.tvCount}</span>
                <span className="ml-1.5 text-text-muted">TV shows</span>
              </div>
              {summary.totalBytes > 0 && (
                <div>
                  <span className="font-display text-2xl text-text-primary">
                    {formatBytes(summary.totalBytes)}
                  </span>
                  <span className="ml-1.5 text-text-muted">on disk</span>
                </div>
              )}
              {totalFreeBytes > 0 && (
                <div>
                  <span className="font-display text-2xl text-text-primary">
                    {formatBytes(totalFreeBytes)}
                  </span>
                  <span className="ml-1.5 text-text-muted">free</span>
                </div>
              )}
            </div>
            {summary.trackedCount > 0 && (
              <p className="mt-2 text-xs text-text-muted">
                + {summary.trackedCount} more monitored or downloading, not counted above
              </p>
            )}
          </div>

          <div className="mt-8">
            {entries.length === 0 ? (
              <p className="text-sm text-text-muted">
                {isAdmin ? (
                  <>
                    Still syncing your library — check back in a moment, or{" "}
                    <Link href="/settings/integrations" className="text-accent hover:text-accent-hover">
                      review your integrations
                    </Link>
                    .
                  </>
                ) : (
                  "Still syncing — check back in a moment."
                )}
              </p>
            ) : (
              <Suspense>
                <MediaList
                  entries={entries}
                  itemLabel="titles"
                  showTypeFilter
                  showStatusFilter
                  showSearch
                  showUnmonitorAction={isAdmin}
                  favoritedKeys={favoritedKeys}
                  showFavorite
                />
              </Suspense>
            )}
          </div>
        </>
      )}
    </div>
  );
}
