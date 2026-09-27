// The Library page's Storage card, the pure part: what the forecast says in
// words and when "full" falls. The data comes from
// lib/integrations/disk-space.ts (getStorageOverview); the forecast math is
// lib/integrations/disk-space-logic.ts.

import type { DiskSpaceForecast } from "@/lib/integrations/disk-space-logic";
import { formatBytes } from "@/lib/format";
import { formatDate } from "@/lib/i18n/format";
import type { Translator } from "@/lib/i18n/translator";

const DAY_MS = 24 * 60 * 60 * 1000;

/** The calendar day the disks run out at the current rate, from `now`. */
export function storageFullOn(forecast: DiskSpaceForecast, now: Date = new Date()): Date {
  return new Date(now.getTime() + Math.max(0, forecast.daysRemaining) * DAY_MS);
}

/**
 * "Full in about 42 days at the current rate (12.3 GB/day)" — or, with no
 * forecast (fewer than two days of snapshots, or free space not shrinking),
 * that there's nothing to say yet. Today when days is 0.
 */
export function storageForecastLine(t: Translator, forecast: DiskSpaceForecast | null): string {
  if (!forecast) return t("library.storageNoForecast");
  const perDay = formatBytes(t, forecast.bytesPerDay);
  if (forecast.daysRemaining <= 0) return t("library.storageFullToday", { perDay });
  return t("library.storageFullIn", { days: forecast.daysRemaining, perDay });
}

/** "Full around July 4, 2026", beside the line above. */
export function storageFullOnLine(t: Translator, forecast: DiskSpaceForecast | null, now: Date = new Date()): string | null {
  if (!forecast || forecast.daysRemaining <= 0) return null;
  return t("library.storageFullOn", { date: formatDate(t, storageFullOn(forecast, now), "long") });
}
