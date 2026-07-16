import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getArrCredential, getPlexCredential } from "@/lib/integrations/credentials";
import { syncPlexLibraryIfStale } from "@/lib/plex/sync";
import { syncArrLibraryIfStale } from "@/lib/arr/sync";
import { getUserLibrary } from "@/lib/library/query";
import { MediaList, type MediaEntry } from "@/components/media-list";
import { SearchBar } from "@/components/search-bar";
import { formatBytes } from "@/lib/format";
import { getFavoritedTmdbIds } from "@/lib/favorites/query";
import { getDiskSpaceSummary } from "@/lib/integrations/disk-space";

export default async function LibraryPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const userId = session.user.id;

  const [plexCred, sonarrCred, radarrCred] = await Promise.all([
    getPlexCredential(userId),
    getArrCredential(userId, "sonarr"),
    getArrCredential(userId, "radarr"),
  ]);

  const anyConnected = Boolean(plexCred || sonarrCred || radarrCred);

  if (!anyConnected) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-20 text-center">
        <h1 className="font-display text-3xl text-text-primary">My Library</h1>
        <p className="mt-3 text-text-secondary">
          Connect Plex, Sonarr, or Radarr to see everything you already own in one place.
        </p>
        <Link
          href="/settings/integrations"
          className="mt-6 inline-block rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-bg-0 transition-colors hover:bg-accent-hover"
        >
          Connect an integration
        </Link>
      </div>
    );
  }

  const [, , diskSpace] = await Promise.all([
    syncPlexLibraryIfStale(userId),
    syncArrLibraryIfStale(userId),
    getDiskSpaceSummary(userId).catch(() => []),
  ]);
  const totalFreeBytes = diskSpace.reduce((sum, d) => sum + d.freeSpace, 0);

  const library = await getUserLibrary(userId);
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

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl text-text-primary">My Library</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Everything already in your connected Plex, Sonarr, and Radarr.
          </p>
        </div>
        <div className="w-full sm:w-80">
          <SearchBar variant="compact" />
        </div>
      </div>

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
            Still syncing your library — check back in a moment, or{" "}
            <Link href="/settings/integrations" className="text-accent hover:text-accent-hover">
              review your integrations
            </Link>
            .
          </p>
        ) : (
          <Suspense>
            <MediaList
              entries={entries}
              itemLabel="titles"
              showTypeFilter
              showStatusFilter
              showSearch
              showUnmonitorAction
              favoritedKeys={favoritedKeys}
              showFavorite
            />
          </Suspense>
        )}
      </div>
    </div>
  );
}
