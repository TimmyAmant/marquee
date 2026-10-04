// Pure decision logic for lib/library/duplicates.ts, kept dependency-free
// (no DB import) so it can be unit tested directly.

import type { MediaType } from "@/lib/db/schema";

export type LibrarySource = "plex" | "jellyfin" | "sonarr" | "radarr";

/** One server's record of a title. */
export type LibraryCopy = {
  source: LibrarySource;
  /** The server's name in Settings ("Tower", "Sonarr"), or the provider name. */
  server: string;
  filePath: string | null;
  sizeBytes: number | null;
  /** A media server's resolution or the arr's quality profile, for telling copies apart. */
  quality: string | null;
};

export type DuplicateGroup = {
  mediaType: MediaType;
  tmdbId: number;
  name: string;
  posterPath: string | null;
  year: string | null;
  copies: LibraryCopy[];
  /** Why it's listed: two files with different paths, or the same title on
   * more than one media server. */
  reason: "paths" | "servers";
};

/** Trailing slashes and a Windows-vs-POSIX separator don't make two paths
 * two files. Case is kept: two files that differ only by case can be two
 * files on the disks these run on. */
export function normalizePath(path: string): string {
  return path.trim().replace(/\\/g, "/").replace(/\/+$/, "");
}

/** A season folder ("Season 01", "Season 1", "S01", "Specials"), which a
 * media server may list a show by instead of the show's own folder. */
const SEASON_FOLDER = /^(season\s*\d+|s\d+|specials)$/i;

/** An episode's file rather than a folder: a video or subtitle extension.
 * Only these — a show's folder can have dots of its own ("The.Office.US",
 * "9-1-1.Lone.Star"), and stepping past that would compare its parent. */
const FILE_NAME = /\.(mkv|mp4|m4v|avi|mov|wmv|ts|m2ts|webm|mpe?g|iso|flv|srt|ass|sub|idx|nfo)$/i;

/**
 * What identifies a file across servers: its last path segment (the file
 * name for a movie, the show's folder for a series), compared without case.
 * Sonarr/Radarr and Plex/Jellyfin usually run in different containers with
 * different mounts — Radarr's "/movies/2012 (2009)/2012 (2009).mp4" is
 * Plex's "/data/Movies/2012 (2009)/2012 (2009).mp4" — so the folders in
 * front of the name say nothing about whether it's another file. For a
 * series the show's folder is what counts: Sonarr lists "/tv/Ahsoka (2023)"
 * where Plex lists a season folder or an episode inside it
 * ("/data/Tv Shows/Ahsoka (2023)/Season 01"), so those are stepped past.
 */
export function fileKey(path: string, mediaType?: MediaType): string {
  const parts = normalizePath(path).split("/").filter(Boolean);
  if (mediaType === "tv") {
    while (parts.length > 1 && (SEASON_FOLDER.test(parts[parts.length - 1]) || FILE_NAME.test(parts[parts.length - 1]))) {
      parts.pop();
    }
  }
  return (parts[parts.length - 1] ?? "").toLowerCase();
}

/**
 * Which titles have duplicates. A title counts when its copies name two or
 * more different files — a stale lower-quality grab left behind after an
 * upgrade, most commonly — judged by file name (fileKey), not by the whole
 * path, since each container mounts the library under its own folder (and,
 * for a series, by the show's folder). It
 * also counts when two servers of the same kind (two Plex servers, or two
 * Jellyfin/Emby servers) both list it: that's the same title indexed twice.
 * Plex and Jellyfin each listing it is how people run both side by side, and
 * an arr and a media server agreeing on a file is the normal case; neither
 * is a duplicate. Pure; unit tested.
 */
export function findDuplicates<T extends { copies: LibraryCopy[]; mediaType?: MediaType }>(
  groups: readonly T[],
): (T & { reason: DuplicateGroup["reason"] })[] {
  const out: (T & { reason: DuplicateGroup["reason"] })[] = [];
  for (const group of groups) {
    const files = new Set(
      group.copies
        .map((c) => c.filePath)
        .filter((p): p is string => Boolean(p))
        .map((p) => fileKey(p, group.mediaType))
        .filter(Boolean),
    );
    const serversOf = (source: LibrarySource) =>
      new Set(group.copies.filter((c) => c.source === source).map((c) => c.server)).size;
    if (files.size >= 2) out.push({ ...group, reason: "paths" });
    else if (serversOf("plex") >= 2 || serversOf("jellyfin") >= 2) out.push({ ...group, reason: "servers" });
  }
  return out;
}
