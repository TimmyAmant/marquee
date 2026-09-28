/**
 * The languages Marquee is translated into, and how one is chosen. Pure (no
 * server or browser APIs), so the website, the API and the tests share it.
 *
 * Which language a page is in, first match wins (lib/i18n/server.ts):
 * the account's own choice (users.language — Settings › Account ›
 * Appearance, or PATCH /me), then the browser's Accept-Language, then
 * English. URLs never carry a language: this is a signed-in app, and a link
 * someone shares should open in the reader's language, not the sender's.
 *
 * Adding a language: docs/translating.md.
 */

/** English first: it's the source every other language is translated from,
 * and what a missing translation falls back to. */
export const LOCALES = ["en", "es", "fr", "de", "pt-BR"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

/** Each language in its own words, for the picker — someone looking for
 * their language should recognise it whatever the page is in now. */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
  "pt-BR": "Português (Brasil)",
};

/**
 * A language tag as one of ours, or null. Case and separator don't matter
 * ("pt_br", "PT-BR"), and a regional tag we don't have falls back to its
 * language ("es-MX" → "es", "de-AT" → "de"). Plain "pt" and any other
 * Portuguese are Brazilian Portuguese, the only Portuguese there is.
 */
export function matchLocale(tag: string | null | undefined): Locale | null {
  if (!tag) return null;
  const cleaned = tag.trim().replace(/_/g, "-").toLowerCase();
  if (!cleaned) return null;
  const exact = LOCALES.find((locale) => locale.toLowerCase() === cleaned);
  if (exact) return exact;
  const language = cleaned.split("-")[0];
  if (language === "pt") return "pt-BR";
  return LOCALES.find((locale) => locale.toLowerCase() === language) ?? null;
}

/** A stored or submitted language: one of ours, or null for "follow the
 * browser". Unknown values are null too, so a language that's later
 * removed just falls back. */
export function parseLocale(value: unknown): Locale | null {
  return typeof value === "string" ? matchLocale(value) : null;
}

/**
 * The best of ours for an Accept-Language header ("fr-CA,fr;q=0.9,en;q=0.8"),
 * or null when none of the listed languages is one we have. Entries are
 * tried in the header's q order; q=0 means "not this one".
 */
export function negotiateLocale(acceptLanguage: string | null | undefined): Locale | null {
  if (!acceptLanguage) return null;
  const entries = acceptLanguage
    .split(",")
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params
        .map((param) => param.trim())
        .find((param) => param.startsWith("q="));
      const weight = q ? Number(q.slice(2)) : 1;
      return { tag: tag.trim(), weight: Number.isFinite(weight) ? weight : 0, index };
    })
    .filter((entry) => entry.tag && entry.tag !== "*" && entry.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.index - b.index);
  for (const entry of entries) {
    const match = matchLocale(entry.tag);
    if (match) return match;
  }
  return null;
}

/** A submitted language: null/"" to follow the browser, or exactly one of
 * ours (any case). Anything else — including a regional variant we don't
 * have, like "es-MX" — is refused rather than quietly saved as something
 * other than what was asked for. */
export function parseLanguageInput(value: unknown): { ok: true; language: Locale | null } | { ok: false } {
  if (value === null || value === undefined || value === "") return { ok: true, language: null };
  if (typeof value !== "string") return { ok: false };
  const language = LOCALES.find((locale) => locale.toLowerCase() === value.trim().replace(/_/g, "-").toLowerCase());
  return language ? { ok: true, language } : { ok: false };
}

/** The account's choice, else the browser's, else English. */
export function resolveLocale(preferred: unknown, acceptLanguage: string | null | undefined): Locale {
  return parseLocale(preferred) ?? negotiateLocale(acceptLanguage) ?? DEFAULT_LOCALE;
}

/** The BCP 47 tag Intl formats dates and numbers with. English is US
 * English, as the site always was. */
export function intlTag(locale: Locale): string {
  return locale === "en" ? "en-US" : locale;
}

/** The language TMDb writes overviews and titles in ("es-ES", "pt-BR"). */
export function tmdbLanguage(locale: Locale): string {
  switch (locale) {
    case "en":
      return "en-US";
    case "es":
      return "es-ES";
    case "fr":
      return "fr-FR";
    case "de":
      return "de-DE";
    case "pt-BR":
      return "pt-BR";
  }
}
