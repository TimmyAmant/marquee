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
 * Which titles have duplicates. A title counts when its copies name two or
 * more different files (an arr's path and a media server's, or two servers'
 * paths — a stale lower-quality grab left behind after an upgrade, most
 * commonly), or when two media servers (Plex and Jellyfin, or two Plex
 * servers) each list it, which means it was indexed twice whether or not
 * the paths are known. An arr and a media server agreeing on one path is
 * the normal case and never a duplicate. Pure; unit tested.
 */
export function findDuplicates<T extends { copies: LibraryCopy[] }>(
  groups: readonly T[],
): (T & { reason: DuplicateGroup["reason"] })[] {
  const out: (T & { reason: DuplicateGroup["reason"] })[] = [];
  for (const group of groups) {
    const paths = new Set(group.copies.map((c) => c.filePath).filter((p): p is string => Boolean(p)).map(normalizePath));
    const mediaServers = group.copies.filter((c) => c.source === "plex" || c.source === "jellyfin").length;
    if (paths.size >= 2) out.push({ ...group, reason: "paths" });
    else if (mediaServers >= 2) out.push({ ...group, reason: "servers" });
  }
  return out;
}
