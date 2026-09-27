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

/**
 * What identifies a file across servers: its last path segment (the file
 * name for a movie, the show's folder for a series), compared without case.
 * Sonarr/Radarr and Plex/Jellyfin usually run in different containers with
 * different mounts — Radarr's "/movies/2012 (2009)/2012 (2009).mp4" is
 * Plex's "/data/Movies/2012 (2009)/2012 (2009).mp4" — so the folders in
 * front of the name say nothing about whether it's another file.
 */
export function fileKey(path: string): string {
  const parts = normalizePath(path).split("/");
  return (parts[parts.length - 1] ?? "").toLowerCase();
}

/**
 * Which titles have duplicates. A title counts when its copies name two or
 * more different files — a stale lower-quality grab left behind after an
 * upgrade, most commonly — judged by file name (fileKey), not by the whole
 * path, since each container mounts the library under its own folder. It
 * also counts when two servers of the same kind (two Plex servers, or two
 * Jellyfin/Emby servers) both list it: that's the same title indexed twice.
 * Plex and Jellyfin each listing it is how people run both side by side, and
 * an arr and a media server agreeing on a file is the normal case; neither
 * is a duplicate. Pure; unit tested.
 */
export function findDuplicates<T extends { copies: LibraryCopy[] }>(
  groups: readonly T[],
): (T & { reason: DuplicateGroup["reason"] })[] {
  const out: (T & { reason: DuplicateGroup["reason"] })[] = [];
  for (const group of groups) {
    const files = new Set(
      group.copies
        .map((c) => c.filePath)
        .filter((p): p is string => Boolean(p))
        .map(fileKey)
        .filter(Boolean),
    );
    const serversOf = (source: LibrarySource) =>
      new Set(group.copies.filter((c) => c.source === source).map((c) => c.server)).size;
    if (files.size >= 2) out.push({ ...group, reason: "paths" });
    else if (serversOf("plex") >= 2 || serversOf("jellyfin") >= 2) out.push({ ...group, reason: "servers" });
  }
  return out;
}
