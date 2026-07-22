export function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** exp).toFixed(1)} ${units[exp]}`;
}

export function formatRuntime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

/** ISO 3166-1 alpha-2 ("US", "GB") to a flag emoji — each letter maps to a
 * Unicode regional indicator symbol a fixed offset from its ASCII code
 * point, which is how flag emoji are composed; no image asset needed. */
export function countryCodeToFlagEmoji(iso: string): string {
  return iso
    .toUpperCase()
    .replace(/./g, (letter) => String.fromCodePoint(127397 + letter.charCodeAt(0)));
}

/** "2026-07-17" → "July 17, 2026", for a title page's sidebar dates. */
export function formatDateLabel(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

/** ISO 639-1 code ("en", "ja") to its English name ("English", "Japanese")
 * via the runtime's own locale data — no manual language-name list to keep
 * in sync. */
export function languageLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}
