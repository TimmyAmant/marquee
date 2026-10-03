// Pure decision logic for lib/library/query.ts, kept dependency-free (no DB
// import) so it can be unit tested directly.

export function toYear(row: { releaseDate: string | null; firstAirDate: string | null }): string | null {
  return (row.releaseDate || row.firstAirDate || "").slice(0, 4) || null;
}

/**
 * An arr-sourced row only stops counting as "in the library" once it was
 * never downloaded at all (still just monitored, no files) and monitoring
 * was turned off — either via Marquee's "Stop monitoring" button or directly
 * in Sonarr/Radarr. Anything with a real file on disk (`owned` or partially
 * `tracked_downloading`) stays visible regardless of the monitored flag.
 *
 * The sync writes "tracked_unmonitored" for this case now; older cached rows
 * still say "untracked", or have the older shape (`tracked_monitored` /
 * `coming_soon` + `monitored: false`, e.g. right after a Stop monitoring,
 * which only flips the flag) — all of them are dropped.
 */
export function isDroppedArrRow(status: string | null, monitored: boolean | null): boolean {
  return arrRowStatus(status, monitored) === "tracked_unmonitored";
}

/**
 * What a Sonarr/Radarr cache row means for the poster badges and strips
 * (getLibraryStatusMap). A row only exists for a title the app has, so every
 * unmonitored-and-nothing-on-disk shape above reads as "tracked_unmonitored"
 * (orange, like Radarr's own "Missing (Unmonitored)") rather than "not in
 * your library".
 */
export function arrRowStatus(
  status: string | null,
  monitored: boolean | null,
):
  | "owned"
  | "tracked_downloading"
  | "ready_to_move"
  | "tracked_monitored"
  | "tracked_unmonitored"
  | "coming_soon" {
  if (status === "owned" || status === "tracked_downloading" || status === "ready_to_move") return status;
  if (monitored === false) return "tracked_unmonitored";
  if (status === "untracked" || status === "tracked_unmonitored") {
    // Start monitoring flips only the flag until the next sync rewrites the
    // status, so a monitored row here is wanted again.
    return monitored === true ? "tracked_monitored" : "tracked_unmonitored";
  }
  return status === "coming_soon" ? "coming_soon" : "tracked_monitored";
}

/**
 * A title can be independently tracked by an arr app (Radarr/Sonarr) and a
 * media server (Plex/Jellyfin) at the same time — if both report a file
 * path for it and those paths don't match, that's a strong signal there
 * are genuinely two separate files on disk for the same title (a stale
 * lower-quality grab left behind after an upgrade, most commonly) rather
 * than the same file just being described two different ways.
 */
export function isPossibleDuplicate(existingPath: string | null, newPath: string | null): boolean {
  return Boolean(existingPath && newPath && existingPath !== newPath);
}

/** Which of a collection's parts are missing, and whether it's worth
 * listing (some owned, some not). Pure; unit tested. */
export function splitCollection<T extends { tmdbId: number }>(
  items: readonly T[],
  ownedIds: ReadonlySet<number>,
): { owned: T[]; missing: T[]; incomplete: boolean } {
  const owned = items.filter((item) => ownedIds.has(item.tmdbId));
  const missing = items.filter((item) => !ownedIds.has(item.tmdbId));
  return { owned, missing, incomplete: owned.length > 0 && missing.length > 0 };
}
