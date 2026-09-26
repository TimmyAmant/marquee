// The words Settings › Integrations › API keys shows for each key (the Mac
// and Windows apps print the same). Pure; unit tested.
import type { ApiKey } from "@/lib/api/types";
import { formatDate } from "@/lib/i18n/format";
import type { Translator } from "@/lib/i18n/translator";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function shortDate(t: Translator, date: Date): string {
  return formatDate(t, date, "medium", "UTC");
}

export function apiKeyScopeLabel(t: Translator, scope: ApiKey["scope"]): string {
  return scope === "read" ? t("integrations.apiKeyReadOnly") : t("integrations.apiKeyFullAccess");
}

/** "as Kid", or null for a key that acts as the admin. */
export function apiKeyActAsLabel(t: Translator, key: Pick<ApiKey, "actAs">): string | null {
  return key.actAs ? t("integrations.apiKeyActAs", { name: key.actAs.label }) : null;
}

export function apiKeyExpiryLabel(t: Translator, key: Pick<ApiKey, "expiresAt" | "expired">): string {
  if (key.expired) return t("integrations.apiKeyExpired");
  if (!key.expiresAt) return t("integrations.apiKeyNeverExpires");
  return t("integrations.apiKeyExpiresOn", { date: shortDate(t, new Date(key.expiresAt)) });
}

export function apiKeyCreatedLabel(t: Translator, key: Pick<ApiKey, "createdAt">): string {
  return t("integrations.apiKeyCreatedOn", { date: shortDate(t, new Date(key.createdAt)) });
}

export function apiKeyLastUsedLabel(t: Translator, key: Pick<ApiKey, "lastUsedAt">, now: Date): string {
  if (!key.lastUsedAt) return t("integrations.apiKeyNeverUsed");
  const used = new Date(key.lastUsedAt);
  const ago = now.getTime() - used.getTime();
  if (ago < 2 * MINUTE) return t("integrations.apiKeyLastUsedJustNow");
  if (ago < HOUR) return t("integrations.apiKeyLastUsedMinutes", { count: Math.floor(ago / MINUTE) });
  if (ago < DAY) return t("integrations.apiKeyLastUsedHours", { count: Math.floor(ago / HOUR) });
  if (ago < 2 * DAY) return t("integrations.apiKeyLastUsedYesterday");
  if (ago < 30 * DAY) return t("integrations.apiKeyLastUsedDays", { count: Math.floor(ago / DAY) });
  return t("integrations.apiKeyLastUsedOn", { date: shortDate(t, used) });
}

/** The expiry choices the create form offers (days; null = never). */
export function apiKeyExpiryChoices(t: Translator): { label: string; days: number | null }[] {
  return [
    { label: t("common.never"), days: null },
    { label: t("integrations.apiKeyExpiryDays", { count: 30 }), days: 30 },
    { label: t("integrations.apiKeyExpiryDays", { count: 90 }), days: 90 },
    { label: t("integrations.apiKeyExpiryYear"), days: 365 },
  ];
}
