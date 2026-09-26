import { formatDate } from "@/lib/i18n/format";
import type { Translator } from "@/lib/i18n/translator";

// "Active 3 hours ago" under each member in Settings → Household members.
// Kept to the recording interval's precision (lib/users/last-active.ts):
// anything within the last ten minutes is "Active now".

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Pure; unit tested. `null` means the account has never been used. */
export function lastActiveLabel(t: Translator, lastActiveAt: Date | null, now: Date): string {
  if (!lastActiveAt) return t("settings.neverSignedIn");
  const ago = now.getTime() - lastActiveAt.getTime();
  if (ago < 10 * MINUTE) return t("settings.activeNow");
  if (ago < 30 * DAY) {
    // "25 minutes ago", "1 hour ago", "yesterday", "6 days ago" — Intl's
    // words for the language.
    const relative = new Intl.RelativeTimeFormat(t.tag, { numeric: "auto" });
    const when =
      ago < HOUR
        ? relative.format(-Math.floor(ago / MINUTE), "minute")
        : ago < DAY
          ? relative.format(-Math.floor(ago / HOUR), "hour")
          : relative.format(-Math.floor(ago / DAY), "day");
    return t("settings.activeAgo", { when });
  }
  return t("settings.lastActiveOn", { date: formatDate(t, lastActiveAt, "medium") });
}
