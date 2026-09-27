// Settings › Discover › Region & language: which country "Currently
// streaming on" and a movie's release dates are for, and the region and
// original language TMDb's Popular/Upcoming rows are filtered to (like
// Seerr's Discover Region / Discover Language). Pure — the stored values
// come from lib/integrations/app-settings.ts.

/** The countries TMDb has streaming providers for (its watch regions),
 * most of them; codes are ISO 3166-1 alpha-2. Named in the reader's
 * language with regionName (lib/i18n/format.ts). */
export const STREAMING_REGIONS = [
  "AR", "AT", "AU", "BE", "BR", "CA", "CH", "CL", "CO", "CZ", "DE", "DK", "EE", "ES", "FI", "FR",
  "GB", "GR", "HK", "HU", "ID", "IE", "IL", "IN", "IT", "JP", "KR", "LT", "LV", "MX", "MY", "NL",
  "NO", "NZ", "PE", "PH", "PL", "PT", "RO", "RU", "SE", "SG", "SK", "TH", "TR", "TW", "UA", "US",
  "ZA",
] as const;

export type StreamingRegion = (typeof STREAMING_REGIONS)[number];

/** The original languages Discover can be limited to (ISO 639-1), with
 * "any" for no limit. Named with languageName (lib/i18n/format.ts). */
export const DISCOVER_LANGUAGES = [
  "en", "es", "fr", "de", "pt", "it", "nl", "sv", "da", "no", "fi", "pl", "cs", "hu", "ro", "el",
  "tr", "ru", "uk", "he", "ar", "hi", "ta", "te", "ja", "ko", "zh", "th", "id", "ms", "tl", "vi",
] as const;

export type DiscoverLanguage = (typeof DISCOVER_LANGUAGES)[number];

export const ANY_LANGUAGE = "any";

/** The original-language filter Discover has always applied. */
export const DEFAULT_DISCOVER_LANGUAGE: DiscoverLanguage = "en";

export function isStreamingRegion(value: unknown): value is StreamingRegion {
  return typeof value === "string" && (STREAMING_REGIONS as readonly string[]).includes(value);
}

export function isDiscoverLanguage(value: unknown): value is DiscoverLanguage {
  return typeof value === "string" && (DISCOVER_LANGUAGES as readonly string[]).includes(value);
}

export type ParsedSetting<T> = { ok: true; value: T | null } | { ok: false };

/** A submitted region: null/"" to follow the default, or one of the
 * regions above (any case). Anything else is refused. */
export function parseRegionInput(value: unknown): ParsedSetting<StreamingRegion> {
  if (value === null || value === undefined || value === "") return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false };
  const code = value.trim().toUpperCase();
  return isStreamingRegion(code) ? { ok: true, value: code } : { ok: false };
}

/** A submitted language: null/"" for the default (English), "any" for no
 * filter, or one of the languages above. */
export function parseLanguageInput(value: unknown): ParsedSetting<DiscoverLanguage | typeof ANY_LANGUAGE> {
  if (value === null || value === undefined || value === "") return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false };
  const code = value.trim().toLowerCase();
  if (code === ANY_LANGUAGE) return { ok: true, value: ANY_LANGUAGE };
  return isDiscoverLanguage(code) ? { ok: true, value: code } : { ok: false };
}

/** The region the server itself is in, from its locale ("en-GB" → GB),
 * when that's one TMDb knows; else US. */
export function regionFromLocale(localeTag: string | null | undefined): StreamingRegion {
  const region = localeTag?.trim().replace(/_/g, "-").split("-")[1]?.toUpperCase();
  return isStreamingRegion(region) ? region : "US";
}

export function serverLocaleTag(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale ?? null;
  } catch {
    return null;
  }
}

export type StoredLocale = {
  streamingRegion: string | null;
  discoverRegion: string | null;
  discoverLanguage: string | null;
};

/** What the settings mean in practice. */
export type DiscoverLocale = {
  /** Always a region: the setting, else the server's own, else US. */
  streamingRegion: StreamingRegion;
  /** TMDb's `region` for Popular/Upcoming, or null for no region. */
  discoverRegion: StreamingRegion | null;
  /** TMDb's `with_original_language`, or null for any language. */
  discoverLanguage: DiscoverLanguage | null;
};

export function resolveDiscoverLocale(stored: StoredLocale, localeTag: string | null = serverLocaleTag()): DiscoverLocale {
  const language = stored.discoverLanguage;
  return {
    streamingRegion: isStreamingRegion(stored.streamingRegion) ? stored.streamingRegion : regionFromLocale(localeTag),
    discoverRegion: isStreamingRegion(stored.discoverRegion) ? stored.discoverRegion : null,
    discoverLanguage:
      language === ANY_LANGUAGE ? null : isDiscoverLanguage(language) ? language : DEFAULT_DISCOVER_LANGUAGE,
  };
}
