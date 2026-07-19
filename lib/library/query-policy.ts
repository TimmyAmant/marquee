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
