/**
 * Dates, times and numbers in the page's language, through Intl — never a
 * hand-built "Jul 17" or "3h ago". Each takes the translator (or just its
 * `tag`) so Server and Client Components share them:
 *
 *   formatDate(t, request.createdAt)            → "Jul 17, 2026" / "17 juil. 2026"
 *   formatDate(t, date, "long")                 → "July 17, 2026" / "17. Juli 2026"
 *   timeAgo(t, notification.createdAt)          → "3 hours ago" / "hace 3 horas"
 *
 * Pure; unit tested.
 */

type HasTag = { tag: string } | string;

function tagOf(source: HasTag): string {
  return typeof source === "string" ? source : source.tag;
}

function toDate(value: Date | string | number): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

const DATE_STYLES = {
  /** "Jul 17, 2026" */
  medium: { month: "short", day: "numeric", year: "numeric" },
  /** "July 17, 2026" */
  long: { month: "long", day: "numeric", year: "numeric" },
  /** "July 2026" */
  monthYear: { month: "long", year: "numeric" },
  /** "Jul 17" */
  dayMonth: { month: "short", day: "numeric" },
  /** "Jul 17, 3:04 PM" */
  dateTime: { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" },
  /** "Jul 17, 2026, 3:04 PM" */
  full: { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" },
} satisfies Record<string, Intl.DateTimeFormatOptions>;

export type DateStyle = keyof typeof DATE_STYLES;

/** A date in the page's language. `timeZone` for dates stored as a
 * calendar day ("2026-07-17" means that day everywhere: pass "UTC"). */
export function formatDate(
  source: HasTag,
  value: Date | string | number | null | undefined,
  style: DateStyle = "medium",
  timeZone?: string,
): string {
  if (value === null || value === undefined || value === "") return "";
  const date = toDate(value);
  if (!date) return "";
  return date.toLocaleString(tagOf(source), { ...DATE_STYLES[style], ...(timeZone ? { timeZone } : {}) });
}

/** A number with the language's separators ("1,234" / "1.234" / "1 234"). */
export function formatNumber(source: HasTag, value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(tagOf(source), options).format(value);
}

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * How long ago, in the page's language: "just now" under a minute, then
 * minutes, hours, days, and past a month the date itself. `numeric: auto`
 * gives "yesterday" rather than "1 day ago" where a language has a word.
 */
export function timeAgo(source: HasTag, value: Date | string | number, now: Date = new Date()): string {
  const date = toDate(value);
  if (!date) return "";
  const tag = tagOf(source);
  const seconds = Math.round((now.getTime() - date.getTime()) / 1000);
  const relative = new Intl.RelativeTimeFormat(tag, { numeric: "auto" });
  if (seconds < MINUTE) return relative.format(0, "second");
  if (seconds < HOUR) return relative.format(-Math.floor(seconds / MINUTE), "minute");
  if (seconds < DAY) return relative.format(-Math.floor(seconds / HOUR), "hour");
  if (seconds < 30 * DAY) return relative.format(-Math.floor(seconds / DAY), "day");
  return formatDate(tag, date, "medium");
}

/** A language's name in the page's language ("ja" → "Japanese" /
 * "japonais"), for TMDb's original-language codes. */
export function languageName(source: HasTag, code: string | null | undefined): string | null {
  if (!code) return null;
  try {
    return new Intl.DisplayNames([tagOf(source)], { type: "language" }).of(code) ?? code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

/** A country's name in the page's language ("US" → "United States"). */
export function regionName(source: HasTag, code: string | null | undefined): string | null {
  if (!code) return null;
  try {
    return new Intl.DisplayNames([tagOf(source)], { type: "region" }).of(code.toUpperCase()) ?? code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}
