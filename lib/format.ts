import { formatDate, formatNumber, languageName } from "@/lib/i18n/format";
import type { MessageKey, Translator } from "@/lib/i18n/translator";

const BYTE_UNITS: MessageKey[] = [
  "title.sizeBytes",
  "title.sizeKilobytes",
  "title.sizeMegabytes",
  "title.sizeGigabytes",
  "title.sizeTerabytes",
];

/** A file size in the page's language ("3.7 GB" / "3,7 Go"). */
export function formatBytes(t: Translator, bytes: number): string {
  if (!bytes) return t(BYTE_UNITS[0], { value: formatNumber(t, 0) });
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), BYTE_UNITS.length - 1);
  const value = formatNumber(t, bytes / 1024 ** exp, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return t(BYTE_UNITS[exp], { value });
}

/** A running time in the page's language ("1h 42m" / "1 h 42 min"). */
export function formatRuntime(t: Translator, minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return t("title.runtimeMinutes", { minutes: mins });
  if (mins === 0) return t("title.runtimeHours", { hours });
  return t("title.runtimeHoursMinutes", { hours, minutes: mins });
}

/** ISO 3166-1 alpha-2 ("US", "GB") to a flag emoji — each letter maps to a
 * Unicode regional indicator symbol a fixed offset from its ASCII code
 * point, which is how flag emoji are composed; no image asset needed. */
export function countryCodeToFlagEmoji(iso: string): string {
  return iso
    .toUpperCase()
    .replace(/./g, (letter) => String.fromCodePoint(127397 + letter.charCodeAt(0)));
}

/** "2026-07-17" → "July 17, 2026" in the page's language, for a title
 * page's sidebar dates. A bare calendar day means that day everywhere, so
 * it's read in UTC. */
export function formatDateLabel(t: Translator, dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return null;
  const calendarDay = /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
  return formatDate(t, date, "long", calendarDay ? "UTC" : undefined);
}

/** ISO 639-1 code ("en", "ja") to its name in the page's language
 * ("English", "Japanese" / "anglais", "japonais") via the runtime's own
 * locale data — no manual language-name list to keep in sync. */
export function languageLabel(t: Translator, code: string | null | undefined): string | null {
  return languageName(t, code);
}
