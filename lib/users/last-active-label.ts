// "Active 3 hours ago" under each member in Settings → Household members.
// Kept to the recording interval's precision (lib/users/last-active.ts):
// anything within the last ten minutes is "Active now".

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Pure; unit tested. `null` means the account has never been used. */
export function lastActiveLabel(lastActiveAt: Date | null, now: Date): string {
  if (!lastActiveAt) return "Never signed in";
  const ago = now.getTime() - lastActiveAt.getTime();
  if (ago < 10 * MINUTE) return "Active now";
  if (ago < HOUR) return `Active ${Math.floor(ago / MINUTE)} minutes ago`;
  if (ago < DAY) {
    const hours = Math.floor(ago / HOUR);
    return `Active ${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  }
  if (ago < 2 * DAY) return "Active yesterday";
  if (ago < 30 * DAY) return `Active ${Math.floor(ago / DAY)} days ago`;
  const date = lastActiveAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `Last active ${date}`;
}
