// Pure forecast math for the disk-space card, kept dependency-free so it can
// be unit tested without a database.

export type DiskSpaceForecast = { daysRemaining: number; bytesPerDay: number };

export type DiskSpaceSnapshotRow = { path: string; freeBytes: number; capturedAt: Date };

// Below this, a couple of GB of routine churn (temp files, a single grabbed
// episode) reads as a multi-year "forecast" that's really just noise —
// not worth showing as if it meant something.
export const MIN_DAILY_SHRINK_BYTES = 100 * 1024 * 1024;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Extrapolates "days until full" from the free-space trend, using the oldest
 * and newest day in the given snapshots — a straight line between two
 * points, not a full regression, since daily snapshots don't have enough
 * noise to justify more.
 *
 * Each path counts once per day (its latest reading), so a manual "Run now"
 * on top of the nightly cron doesn't double that day's total. And only
 * paths present on both days are compared: if Radarr was down for one of
 * the snapshots, its folders are missing that day, and summing anyway would
 * read as terabytes suddenly vanishing or appearing.
 *
 * Returns null until there are two distinct days sharing at least one path,
 * or if free space isn't meaningfully shrinking (flat, or actually growing).
 */
export function forecastDiskSpace(rows: readonly DiskSpaceSnapshotRow[]): DiskSpaceForecast | null {
  const byDay = new Map<string, Map<string, { freeBytes: number; at: number }>>();
  for (const row of rows) {
    const day = row.capturedAt.toISOString().slice(0, 10);
    const at = row.capturedAt.getTime();
    let paths = byDay.get(day);
    if (!paths) {
      paths = new Map();
      byDay.set(day, paths);
    }
    const existing = paths.get(row.path);
    if (!existing || at >= existing.at) paths.set(row.path, { freeBytes: row.freeBytes, at });
  }

  const days = [...byDay.keys()].sort();
  if (days.length < 2) return null;

  const oldestDay = days[0];
  const newestDay = days[days.length - 1];
  const oldest = byDay.get(oldestDay)!;
  const newest = byDay.get(newestDay)!;

  let oldestFree = 0;
  let newestFree = 0;
  let shared = 0;
  for (const [path, reading] of newest) {
    const before = oldest.get(path);
    if (!before) continue;
    oldestFree += before.freeBytes;
    newestFree += reading.freeBytes;
    shared++;
  }
  if (shared === 0) return null;

  const dayCount = Math.max(1, Math.round((Date.parse(newestDay) - Date.parse(oldestDay)) / DAY_MS));

  const bytesPerDay = (oldestFree - newestFree) / dayCount;
  if (bytesPerDay < MIN_DAILY_SHRINK_BYTES) return null;

  return { daysRemaining: Math.floor(newestFree / bytesPerDay), bytesPerDay };
}
