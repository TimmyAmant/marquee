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
 * `deriveRadarrStatus`/`deriveSonarrStatus` now write "untracked" directly
 * for this case going forward, but older cached rows synced before that fix
 * still have the pre-fix shape (`tracked_monitored` + `monitored: false`) —
 * treat both as dropped so already-cached rows self-heal without a re-sync.
 */
export function isDroppedArrRow(status: string | null, monitored: boolean | null): boolean {
  return (
    status === "untracked" ||
    ((status === "tracked_monitored" || status === "coming_soon") && monitored === false)
  );
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
