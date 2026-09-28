import { and, desc, eq, inArray, isNotNull, max, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  plexServers,
  plexLibraryItems,
  jellyfinServers,
  jellyfinLibraryItems,
  arrStatusCache,
  titles,
} from "@/lib/db/schema";
import type { MediaType } from "@/lib/db/schema";
import type { LibraryStatus } from "@/components/status-badge";
import { toYear, arrRowStatus, isDroppedArrRow, isPossibleDuplicate } from "@/lib/library/query-policy";
import { statusRank } from "@/lib/arr/fan-out";
import {
  pickEpisodeCounts,
  tmdbAiredEpisodeCount,
  type EpisodeCounts,
  type TmdbAiringInfo,
} from "@/lib/library/episode-counts";

export type LibrarySource = "plex" | "jellyfin" | "sonarr" | "radarr";

export type LibraryItem = {
  titleId: string;
  mediaType: MediaType;
  tmdbId: number;
  tvdbId: number | null;
  name: string;
  posterPath: string | null;
  year: string | null;
  /** TMDb's genre names, for the Library page's genre filter. */
  genres: string[];
  /** TMDb vote average, 0–10; null when TMDb has none. */
  rating: number | null;
  status: LibraryStatus;
  source: LibrarySource;
  sizeBytes: number | null;
  addedAt: Date | null;
  monitored: boolean | null;
  /** The title's id inside Radarr/Sonarr where one of them tracks it (the
   * admin's Search now / monitoring actions); null for a media-server-only
   * title. */
  arrId: number | null;
  /** Shows: episode files on disk, from Sonarr or Plex; null when neither
   * reports it (Jellyfin doesn't), and for movies. */
  episodeCount: number | null;
  filePath: string | null;
  /** Radarr-only for now — true when the owned file is below the
   * configured quality cutoff (an upgrade is expected/possible). */
  qualityCutoffNotMet: boolean;
  /** Radarr's quality profile name for the file on disk (e.g.
   * "Bluray-1080p") — resolution badges are derived from this string.
   * Radarr-only for now, same gap as qualityCutoffNotMet above. */
  qualityName: string | null;
  /** The resolution a media server recorded for the file ("4K", "1080p", or
   * a raw "WxH") — how a Plex/Jellyfin-owned title gets a resolution badge
   * without a Radarr quality profile to derive one from. Null for a title
   * only an *arr knows about; `qualityName` covers those. */
  resolution: string | null;
  /** From Radarr where it tracks the title, otherwise from the media server
   * that owns it. */
  dynamicRange: string | null;
  audioCodec: string | null;
  /** The media server's video codec ("HEVC", "AV1"); the arrs don't cache one. */
  videoCodec: string | null;
  /** True when an arr app and a media server both report a file path for
   * this title and the paths don't match — a strong signal there are two
   * separate files on disk (e.g. a stale lower-quality grab left behind
   * after an upgrade). Both paths are kept so the UI can show them. */
  possibleDuplicate: boolean;
  otherFilePath: string | null;
};

// Just the title columns a library row needs. Selecting the whole `titles`
// row would drag every title's raw TMDb/TVDB JSON (cast, videos, seasons)
// across the wire on each library load, only to throw it away.
const libraryTitleColumns = {
  id: titles.id,
  mediaType: titles.mediaType,
  tmdbId: titles.tmdbId,
  tvdbId: titles.tvdbId,
  name: titles.name,
  posterPath: titles.posterPath,
  releaseDate: titles.releaseDate,
  firstAirDate: titles.firstAirDate,
  // Two small pieces of the raw TMDb record (the genre names and the vote
  // average), picked out in SQL rather than by loading the whole JSON.
  genres: sql<{ name?: string }[] | null>`${titles.rawTmdb}->'genres'`,
  rating: sql<number | string | null>`(${titles.rawTmdb}->>'vote_average')::float8`,
};

type LibraryTitleRow = {
  id: string;
  mediaType: MediaType;
  tmdbId: number;
  tvdbId: number | null;
  name: string;
  posterPath: string | null;
  releaseDate: string | null;
  firstAirDate: string | null;
  genres: { name?: string }[] | null;
  rating: number | string | null;
};

function titleGenres(row: LibraryTitleRow): string[] {
  if (!Array.isArray(row.genres)) return [];
  return row.genres.map((g) => (typeof g?.name === "string" ? g.name.trim() : "")).filter((name) => name.length > 0);
}

function titleRating(row: LibraryTitleRow): number | null {
  if (row.rating == null) return null;
  const value = Number(row.rating);
  return Number.isFinite(value) && value > 0 ? Math.round(value * 10) / 10 : null;
}

/** The title columns every library row shares. */
function titleFields(row: LibraryTitleRow) {
  return {
    titleId: row.id,
    mediaType: row.mediaType,
    tmdbId: row.tmdbId,
    tvdbId: row.tvdbId,
    name: row.name,
    posterPath: row.posterPath,
    year: toYear(row),
    genres: titleGenres(row),
    rating: titleRating(row),
  };
}

export async function getUserLibrary(userId: string): Promise<LibraryItem[]> {
  const byKey = new Map<string, LibraryItem>();

  const [radarrRows, sonarrRows] = await Promise.all([
    db
      .select({
        title: libraryTitleColumns,
        status: arrStatusCache.status,
        sizeBytes: arrStatusCache.sizeBytes,
        monitored: arrStatusCache.monitored,
        arrId: arrStatusCache.arrId,
        filePath: arrStatusCache.filePath,
        qualityCutoffNotMet: arrStatusCache.qualityCutoffNotMet,
        qualityName: arrStatusCache.qualityName,
        dynamicRange: arrStatusCache.dynamicRange,
        audioCodec: arrStatusCache.audioCodec,
      })
      .from(arrStatusCache)
      .innerJoin(titles, and(eq(titles.mediaType, "movie"), eq(titles.tmdbId, arrStatusCache.externalId)))
      .where(and(eq(arrStatusCache.userId, userId), eq(arrStatusCache.provider, "radarr"))),
    db
      .select({
        title: libraryTitleColumns,
        status: arrStatusCache.status,
        sizeBytes: arrStatusCache.sizeBytes,
        monitored: arrStatusCache.monitored,
        arrId: arrStatusCache.arrId,
        filePath: arrStatusCache.filePath,
        episodeCount: arrStatusCache.episodeCount,
      })
      .from(arrStatusCache)
      .innerJoin(titles, and(eq(titles.mediaType, "tv"), eq(titles.tmdbId, arrStatusCache.externalId)))
      .where(and(eq(arrStatusCache.userId, userId), eq(arrStatusCache.provider, "sonarr"))),
  ]);

  for (const {
    title,
    status,
    sizeBytes,
    monitored,
    arrId,
    filePath,
    qualityCutoffNotMet,
    qualityName,
    dynamicRange,
    audioCodec,
  } of radarrRows) {
    if (isDroppedArrRow(status, monitored)) continue;

    const key = `${title.mediaType}:${title.tmdbId}`;
    byKey.set(key, {
      ...titleFields(title),
      status: arrRowStatus(status, monitored),
      source: "radarr",
      sizeBytes,
      addedAt: null,
      monitored,
      arrId,
      episodeCount: null,
      filePath,
      qualityCutoffNotMet: qualityCutoffNotMet ?? false,
      qualityName,
      resolution: null,
      dynamicRange,
      audioCodec,
      videoCodec: null,
      possibleDuplicate: false,
      otherFilePath: null,
    });
  }

  for (const { title, status, sizeBytes, monitored, arrId, filePath, episodeCount } of sonarrRows) {
    if (isDroppedArrRow(status, monitored)) continue;

    const key = `${title.mediaType}:${title.tmdbId}`;
    byKey.set(key, {
      ...titleFields(title),
      status: arrRowStatus(status, monitored),
      source: "sonarr",
      sizeBytes,
      addedAt: null,
      monitored,
      arrId,
      episodeCount,
      filePath,
      qualityCutoffNotMet: false,
      qualityName: null,
      resolution: null,
      dynamicRange: null,
      audioCodec: null,
      videoCodec: null,
      possibleDuplicate: false,
      otherFilePath: null,
    });
  }

  const plexServerRows = await db
    .select({ id: plexServers.id })
    .from(plexServers)
    .where(eq(plexServers.userId, userId));
  const plexServerIds = plexServerRows.map((r) => r.id);

  if (plexServerIds.length > 0) {
    const plexRows = await db
      .select({
        title: libraryTitleColumns,
        sizeBytes: plexLibraryItems.sizeBytes,
        addedAt: plexLibraryItems.addedAt,
        filePath: plexLibraryItems.filePath,
        resolution: plexLibraryItems.resolution,
        dynamicRange: plexLibraryItems.dynamicRange,
        audioCodec: plexLibraryItems.audioCodec,
        videoCodec: plexLibraryItems.videoCodec,
        episodeCount: plexLibraryItems.episodeCount,
      })
      .from(plexLibraryItems)
      .innerJoin(
        titles,
        and(eq(titles.mediaType, plexLibraryItems.mediaType), eq(titles.tmdbId, plexLibraryItems.tmdbId)),
      )
      .where(inArray(plexLibraryItems.plexServerId, plexServerIds));

    // Plex takes precedence over "owned"/"monitored" arr entries — but not
    // over an active download: Radarr can be re-grabbing a title Plex
    // already has an (older) file for, and "Downloading" is the more useful
    // status to surface until the new file lands.
    for (const {
      title,
      sizeBytes,
      addedAt,
      filePath,
      resolution,
      dynamicRange,
      audioCodec,
      videoCodec,
      episodeCount,
    } of plexRows) {
      const key = `${title.mediaType}:${title.tmdbId}`;
      const existing = byKey.get(key);
      if (existing?.status === "tracked_downloading") {
        byKey.set(key, { ...existing, sizeBytes, addedAt, episodeCount: existing.episodeCount ?? episodeCount, videoCodec });
        continue;
      }
      byKey.set(key, {
        ...titleFields(title),
        status: "owned",
        source: "plex",
        sizeBytes,
        addedAt,
        // The arr's monitoring flag and id ride along, so the admin's
        // Search now / Stop monitoring still work on a Plex-owned title
        // Radarr/Sonarr also tracks.
        monitored: existing?.monitored ?? null,
        arrId: existing?.arrId ?? null,
        // Sonarr's episode-file count is the more exact of the two.
        episodeCount: existing?.episodeCount ?? episodeCount,
        // Plex only carries a single file path for movies (a show has one
        // per episode, not one for the whole series) — fall back to
        // whatever Sonarr already had cached for this title, if any.
        filePath: filePath ?? existing?.filePath ?? null,
        // Plex has no notion of quality cutoffs — carry over whatever
        // Radarr already determined for this title, if any.
        qualityCutoffNotMet: existing?.qualityCutoffNotMet ?? false,
        qualityName: existing?.qualityName ?? null,
        // Radarr's mediaInfo wins where it has the title (it's authoritative
        // about the release it fetched); the media server's own record of the
        // file fills the gap for everything it doesn't track.
        resolution,
        dynamicRange: existing?.dynamicRange ?? dynamicRange,
        audioCodec: existing?.audioCodec ?? audioCodec,
        videoCodec,
        possibleDuplicate: isPossibleDuplicate(existing?.filePath ?? null, filePath),
        otherFilePath: isPossibleDuplicate(existing?.filePath ?? null, filePath)
          ? existing!.filePath
          : null,
      });
    }
  }

  const jellyfinServerRows = await db
    .select({ id: jellyfinServers.id })
    .from(jellyfinServers)
    .where(eq(jellyfinServers.userId, userId));
  const jellyfinServerIds = jellyfinServerRows.map((r) => r.id);

  if (jellyfinServerIds.length > 0) {
    const jellyfinRows = await db
      .select({
        title: libraryTitleColumns,
        sizeBytes: jellyfinLibraryItems.sizeBytes,
        addedAt: jellyfinLibraryItems.addedAt,
        filePath: jellyfinLibraryItems.filePath,
        resolution: jellyfinLibraryItems.resolution,
        dynamicRange: jellyfinLibraryItems.dynamicRange,
        audioCodec: jellyfinLibraryItems.audioCodec,
        videoCodec: jellyfinLibraryItems.videoCodec,
      })
      .from(jellyfinLibraryItems)
      .innerJoin(
        titles,
        and(
          eq(titles.mediaType, jellyfinLibraryItems.mediaType),
          eq(titles.tmdbId, jellyfinLibraryItems.tmdbId),
        ),
      )
      .where(inArray(jellyfinLibraryItems.jellyfinServerId, jellyfinServerIds));

    // Same precedence rule as the Plex merge above — an active download
    // still wins over "owned" from a media-server sync.
    for (const {
      title,
      sizeBytes,
      addedAt,
      filePath,
      resolution,
      dynamicRange,
      audioCodec,
      videoCodec,
    } of jellyfinRows) {
      const key = `${title.mediaType}:${title.tmdbId}`;
      const existing = byKey.get(key);
      if (existing?.status === "tracked_downloading") {
        byKey.set(key, { ...existing, sizeBytes, addedAt, videoCodec });
        continue;
      }
      byKey.set(key, {
        ...titleFields(title),
        status: "owned",
        source: "jellyfin",
        sizeBytes,
        addedAt,
        monitored: existing?.monitored ?? null,
        arrId: existing?.arrId ?? null,
        episodeCount: existing?.episodeCount ?? null,
        filePath: filePath ?? existing?.filePath ?? null,
        qualityCutoffNotMet: existing?.qualityCutoffNotMet ?? false,
        qualityName: existing?.qualityName ?? null,
        // Same precedence as the Plex merge above.
        resolution,
        dynamicRange: existing?.dynamicRange ?? dynamicRange,
        audioCodec: existing?.audioCodec ?? audioCodec,
        videoCodec,
        possibleDuplicate: isPossibleDuplicate(existing?.filePath ?? null, filePath),
        otherFilePath: isPossibleDuplicate(existing?.filePath ?? null, filePath)
          ? existing!.filePath
          : null,
      });
    }
  }

  return Array.from(byKey.values());
}

export type LibrarySummary = {
  movieCount: number;
  tvCount: number;
  /** Episode files on disk across the shows Sonarr or Plex know — a
   * Jellyfin-only show adds nothing (it doesn't report a count). */
  episodeCount: number;
  totalBytes: number;
  trackedCount: number;
};

/** Pure summary derivation — split out so a caller that already has the
 * library array can reuse it without a second getUserLibrary query. */
export function summarizeLibrary(library: LibraryItem[]): LibrarySummary {
  const owned = library.filter((i) => i.status === "owned");
  return {
    movieCount: owned.filter((i) => i.mediaType === "movie").length,
    tvCount: owned.filter((i) => i.mediaType === "tv").length,
    episodeCount: library.reduce((sum, i) => sum + (i.mediaType === "tv" ? (i.episodeCount ?? 0) : 0), 0),
    totalBytes: owned.reduce((sum, i) => sum + (i.sizeBytes ?? 0), 0),
    trackedCount: library.length - owned.length,
  };
}

export type RecentlyAddedItem = Pick<
  LibraryItem,
  "titleId" | "mediaType" | "tmdbId" | "name" | "posterPath" | "year" | "status"
> & { addedAt: Date };

/**
 * Most-recently-added owned titles, for Discover's "Recently Added" row —
 * only Plex/Jellyfin-sourced rows carry an addedAt timestamp (arr-only rows
 * don't track one), so anything without it is dropped rather than sorted
 * arbitrarily to one end.
 *
 * Sorted and limited in SQL, per media server, rather than by building the
 * whole library and slicing it — this runs on every Discover load. A title
 * on more than one server counts at its newest addedAt.
 */
export async function getRecentlyAdded(
  userId: string,
  limit = 20,
  /** Only movies or only series (a custom Discover row); both when left out. */
  mediaType?: MediaType,
): Promise<RecentlyAddedItem[]> {
  const [plexServerRows, jellyfinServerRows] = await Promise.all([
    db.select({ id: plexServers.id }).from(plexServers).where(eq(plexServers.userId, userId)),
    db.select({ id: jellyfinServers.id }).from(jellyfinServers).where(eq(jellyfinServers.userId, userId)),
  ]);
  const plexServerIds = plexServerRows.map((r) => r.id);
  const jellyfinServerIds = jellyfinServerRows.map((r) => r.id);

  const plexAddedAt = max(plexLibraryItems.addedAt);
  const jellyfinAddedAt = max(jellyfinLibraryItems.addedAt);
  const [plexRows, jellyfinRows] = await Promise.all([
    plexServerIds.length === 0
      ? []
      : db
          .select({ title: libraryTitleColumns, addedAt: plexAddedAt })
          .from(plexLibraryItems)
          .innerJoin(
            titles,
            and(eq(titles.mediaType, plexLibraryItems.mediaType), eq(titles.tmdbId, plexLibraryItems.tmdbId)),
          )
          .where(
            and(
              inArray(plexLibraryItems.plexServerId, plexServerIds),
              isNotNull(plexLibraryItems.addedAt),
              mediaType ? eq(plexLibraryItems.mediaType, mediaType) : undefined,
            ),
          )
          .groupBy(titles.id)
          .orderBy(desc(plexAddedAt))
          .limit(limit),
    jellyfinServerIds.length === 0
      ? []
      : db
          .select({ title: libraryTitleColumns, addedAt: jellyfinAddedAt })
          .from(jellyfinLibraryItems)
          .innerJoin(
            titles,
            and(
              eq(titles.mediaType, jellyfinLibraryItems.mediaType),
              eq(titles.tmdbId, jellyfinLibraryItems.tmdbId),
            ),
          )
          .where(
            and(
              inArray(jellyfinLibraryItems.jellyfinServerId, jellyfinServerIds),
              isNotNull(jellyfinLibraryItems.addedAt),
              mediaType ? eq(jellyfinLibraryItems.mediaType, mediaType) : undefined,
            ),
          )
          .groupBy(titles.id)
          .orderBy(desc(jellyfinAddedAt))
          .limit(limit),
  ]);

  const byTitle = new Map<string, { title: (typeof plexRows)[number]["title"]; addedAt: Date }>();
  for (const { title, addedAt } of [...plexRows, ...jellyfinRows]) {
    if (!addedAt) continue;
    const existing = byTitle.get(title.id);
    if (!existing || addedAt > existing.addedAt) byTitle.set(title.id, { title, addedAt });
  }
  const newest = [...byTitle.values()]
    .sort((a, b) => b.addedAt.getTime() - a.addedAt.getTime())
    .slice(0, limit);
  if (newest.length === 0) return [];

  // Same precedence as getUserLibrary: a media-server title is "owned"
  // unless its *arr is re-grabbing it right now.
  const movieIds = newest.filter((r) => r.title.mediaType === "movie").map((r) => r.title.tmdbId);
  const tvIds = newest.filter((r) => r.title.mediaType === "tv").map((r) => r.title.tmdbId);
  const arrMatches = [
    movieIds.length > 0
      ? and(eq(arrStatusCache.provider, "radarr"), inArray(arrStatusCache.externalId, movieIds))
      : undefined,
    tvIds.length > 0
      ? and(eq(arrStatusCache.provider, "sonarr"), inArray(arrStatusCache.externalId, tvIds))
      : undefined,
  ];
  const downloadingRows = await db
    .select({ provider: arrStatusCache.provider, externalId: arrStatusCache.externalId })
    .from(arrStatusCache)
    .where(
      and(
        eq(arrStatusCache.userId, userId),
        eq(arrStatusCache.status, "tracked_downloading"),
        or(...arrMatches),
      ),
    );
  const downloading = new Set(
    downloadingRows.map((r) => `${r.provider === "radarr" ? "movie" : "tv"}:${r.externalId}`),
  );

  return newest.map(({ title, addedAt }) => ({
    titleId: title.id,
    mediaType: title.mediaType,
    tmdbId: title.tmdbId,
    name: title.name,
    posterPath: title.posterPath,
    year: toYear(title),
    status: downloading.has(`${title.mediaType}:${title.tmdbId}`) ? "tracked_downloading" : "owned",
    addedAt,
  }));
}

/**
 * Local-only bulk ownership lookup for listing pages (homepage rows, search
 * results, Discover). Never calls Sonarr/Radarr/Plex live — reads only what's
 * already synced, so it's cheap to run against a full page of results.
 */
export async function getLibraryStatusMap(
  userId: string,
  items: { mediaType: MediaType; tmdbId: number }[],
): Promise<Map<string, LibraryStatus>> {
  const map = new Map<string, LibraryStatus>();
  if (items.length === 0) return map;

  const movieIds = items.filter((i) => i.mediaType === "movie").map((i) => i.tmdbId);
  const tvIds = items.filter((i) => i.mediaType === "tv").map((i) => i.tmdbId);

  if (movieIds.length > 0) {
    const rows = await db
      .select({
        tmdbId: arrStatusCache.externalId,
        status: arrStatusCache.status,
        monitored: arrStatusCache.monitored,
      })
      .from(arrStatusCache)
      .where(
        and(
          eq(arrStatusCache.userId, userId),
          eq(arrStatusCache.provider, "radarr"),
          inArray(arrStatusCache.externalId, movieIds),
        ),
      );
    for (const row of rows) {
      // Unmonitored with nothing on disk still gets its (orange) status here,
      // unlike the library list, which drops it (isDroppedArrRow). With
      // several servers, the copy furthest along wins.
      const key = `movie:${row.tmdbId}`;
      const status = arrRowStatus(row.status, row.monitored);
      if (statusRank(status) > statusRank(map.get(key))) map.set(key, status);
    }
  }

  if (tvIds.length > 0) {
    const rows = await db
      .select({
        tmdbId: arrStatusCache.externalId,
        status: arrStatusCache.status,
        monitored: arrStatusCache.monitored,
      })
      .from(arrStatusCache)
      .where(
        and(
          eq(arrStatusCache.userId, userId),
          eq(arrStatusCache.provider, "sonarr"),
          inArray(arrStatusCache.externalId, tvIds),
        ),
      );
    for (const row of rows) {
      // Unmonitored with nothing on disk still gets its (orange) status here,
      // unlike the library list, which drops it (isDroppedArrRow). With
      // several servers, the copy furthest along wins.
      const key = `tv:${row.tmdbId}`;
      const status = arrRowStatus(row.status, row.monitored);
      if (statusRank(status) > statusRank(map.get(key))) map.set(key, status);
    }
  }

  const plexServerRows = await db
    .select({ id: plexServers.id })
    .from(plexServers)
    .where(eq(plexServers.userId, userId));
  const plexServerIds = plexServerRows.map((r) => r.id);
  const allIds = [...movieIds, ...tvIds];

  if (plexServerIds.length > 0 && allIds.length > 0) {
    const rows = await db
      .select({ mediaType: plexLibraryItems.mediaType, tmdbId: plexLibraryItems.tmdbId })
      .from(plexLibraryItems)
      .where(
        and(
          inArray(plexLibraryItems.plexServerId, plexServerIds),
          inArray(plexLibraryItems.tmdbId, allIds),
        ),
      );
    for (const row of rows) {
      if (row.tmdbId == null) continue;
      const key = `${row.mediaType}:${row.tmdbId}`;
      if (map.get(key) === "tracked_downloading") continue;
      map.set(key, "owned");
    }
  }

  const jellyfinServerRows = await db
    .select({ id: jellyfinServers.id })
    .from(jellyfinServers)
    .where(eq(jellyfinServers.userId, userId));
  const jellyfinServerIds = jellyfinServerRows.map((r) => r.id);

  if (jellyfinServerIds.length > 0 && allIds.length > 0) {
    const rows = await db
      .select({ mediaType: jellyfinLibraryItems.mediaType, tmdbId: jellyfinLibraryItems.tmdbId })
      .from(jellyfinLibraryItems)
      .where(
        and(
          inArray(jellyfinLibraryItems.jellyfinServerId, jellyfinServerIds),
          inArray(jellyfinLibraryItems.tmdbId, allIds),
        ),
      );
    for (const row of rows) {
      if (row.tmdbId == null) continue;
      const key = `${row.mediaType}:${row.tmdbId}`;
      if (map.get(key) === "tracked_downloading") continue;
      map.set(key, "owned");
    }
  }

  return map;
}

/**
 * A series poster's "have/total" for each show in `items` the library has
 * ("tv:1407" → { have, total }) — movies never get one. Like
 * getLibraryStatusMap, it reads only what the syncs stored: Sonarr's counts
 * where it tracks the show, else the media servers' episode files against
 * TMDb's aired episodes (lib/library/episode-counts.ts). A show with
 * neither has no entry.
 */
export async function getEpisodeCountMap(
  userId: string,
  items: { mediaType: MediaType; tmdbId: number }[],
): Promise<Map<string, EpisodeCounts>> {
  const map = new Map<string, EpisodeCounts>();
  const tvIds = [...new Set(items.filter((i) => i.mediaType === "tv").map((i) => i.tmdbId))];
  if (tvIds.length === 0) return map;

  const [sonarrRows, plexServerRows, jellyfinServerRows] = await Promise.all([
    db
      .select({
        tmdbId: arrStatusCache.externalId,
        have: arrStatusCache.episodesHave,
        aired: arrStatusCache.episodesAired,
      })
      .from(arrStatusCache)
      .where(
        and(
          eq(arrStatusCache.userId, userId),
          eq(arrStatusCache.provider, "sonarr"),
          inArray(arrStatusCache.externalId, tvIds),
        ),
      ),
    db.select({ id: plexServers.id }).from(plexServers).where(eq(plexServers.userId, userId)),
    db.select({ id: jellyfinServers.id }).from(jellyfinServers).where(eq(jellyfinServers.userId, userId)),
  ]);

  const sonarr = new Map(sonarrRows.map((r) => [r.tmdbId, { have: r.have, total: r.aired }]));
  const fromSonarr = (tmdbId: number) =>
    pickEpisodeCounts({ sonarr: sonarr.get(tmdbId) ?? null, mediaServerHave: null, tmdbAired: null });
  const rest = tvIds.filter((id) => !fromSonarr(id));

  // Media-server files, the most any one server has, for the shows Sonarr
  // doesn't count.
  const mediaServerHave = new Map<number, number>();
  const plexServerIds = plexServerRows.map((r) => r.id);
  const jellyfinServerIds = jellyfinServerRows.map((r) => r.id);
  if (rest.length > 0) {
    const [plexRows, jellyfinRows] = await Promise.all([
      plexServerIds.length === 0
        ? []
        : db
            .select({ tmdbId: plexLibraryItems.tmdbId, have: plexLibraryItems.episodesHave })
            .from(plexLibraryItems)
            .where(
              and(
                inArray(plexLibraryItems.plexServerId, plexServerIds),
                eq(plexLibraryItems.mediaType, "tv"),
                inArray(plexLibraryItems.tmdbId, rest),
              ),
            ),
      jellyfinServerIds.length === 0
        ? []
        : db
            .select({ tmdbId: jellyfinLibraryItems.tmdbId, have: jellyfinLibraryItems.episodesHave })
            .from(jellyfinLibraryItems)
            .where(
              and(
                inArray(jellyfinLibraryItems.jellyfinServerId, jellyfinServerIds),
                eq(jellyfinLibraryItems.mediaType, "tv"),
                inArray(jellyfinLibraryItems.tmdbId, rest),
              ),
            ),
    ]);
    for (const row of [...plexRows, ...jellyfinRows]) {
      if (row.tmdbId == null || row.have == null) continue;
      mediaServerHave.set(row.tmdbId, Math.max(row.have, mediaServerHave.get(row.tmdbId) ?? 0));
    }
  }

  // TMDb's aired count, only for the shows that need it — two small pieces
  // of the cached record, picked out in SQL rather than loading the JSON.
  const needAired = [...mediaServerHave.keys()];
  const airedRows =
    needAired.length === 0
      ? []
      : await db
          .select({
            tmdbId: titles.tmdbId,
            seasons: sql<TmdbAiringInfo["seasons"]>`${titles.rawTmdb}->'seasons'`,
            lastEpisode: sql<TmdbAiringInfo["last_episode_to_air"]>`${titles.rawTmdb}->'last_episode_to_air'`,
          })
          .from(titles)
          .where(and(eq(titles.mediaType, "tv"), inArray(titles.tmdbId, needAired)));
  const aired = new Map(
    airedRows.map((r) => [r.tmdbId, tmdbAiredEpisodeCount({ seasons: r.seasons, last_episode_to_air: r.lastEpisode })]),
  );

  for (const tmdbId of tvIds) {
    const counts = pickEpisodeCounts({
      sonarr: sonarr.get(tmdbId) ?? null,
      mediaServerHave: mediaServerHave.get(tmdbId) ?? null,
      tmdbAired: aired.get(tmdbId) ?? null,
    });
    if (counts) map.set(`tv:${tmdbId}`, counts);
  }
  return map;
}
