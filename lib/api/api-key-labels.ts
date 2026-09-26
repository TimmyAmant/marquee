// The words Settings › Integrations › API keys shows for each key (the Mac
// and Windows apps print the same). Pure; unit tested.
import type { ApiKey } from "@/lib/api/types";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function shortDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function apiKeyScopeLabel(scope: ApiKey["scope"]): string {
  return scope === "read" ? "Read-only" : "Full access";
}

/** "as Kid", or null for a key that acts as the admin. */
export function apiKeyActAsLabel(key: Pick<ApiKey, "actAs">): string | null {
  return key.actAs ? `as ${key.actAs.label}` : null;
}

export function apiKeyExpiryLabel(key: Pick<ApiKey, "expiresAt" | "expired">): string {
  if (key.expired) return "Expired";
  if (!key.expiresAt) return "Never expires";
  return `Expires ${shortDate(new Date(key.expiresAt))}`;
}

export function apiKeyCreatedLabel(key: Pick<ApiKey, "createdAt">): string {
  return `Created ${shortDate(new Date(key.createdAt))}`;
}

export function apiKeyLastUsedLabel(key: Pick<ApiKey, "lastUsedAt">, now: Date): string {
  if (!key.lastUsedAt) return "Never used";
  const used = new Date(key.lastUsedAt);
  const ago = now.getTime() - used.getTime();
  if (ago < 2 * MINUTE) return "Last used just now";
  if (ago < HOUR) return `Last used ${Math.floor(ago / MINUTE)} minutes ago`;
  if (ago < DAY) {
    const hours = Math.floor(ago / HOUR);
    return `Last used ${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  }
  if (ago < 2 * DAY) return "Last used yesterday";
  if (ago < 30 * DAY) return `Last used ${Math.floor(ago / DAY)} days ago`;
  return `Last used ${shortDate(used)}`;
}

/** The expiry choices the create form offers (days; null = never). */
export const API_KEY_EXPIRY_CHOICES: { label: string; days: number | null }[] = [
  { label: "Never", days: null },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
  { label: "1 year", days: 365 },
];
