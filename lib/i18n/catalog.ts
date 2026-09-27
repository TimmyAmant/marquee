import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales";
import { catalogs, english, NAMESPACES } from "@/lib/i18n/messages";
import { createTranslator, type Messages, type Translator } from "@/lib/i18n/translator";

/**
 * Every language's messages, for the server and the tests. Client
 * Components never import this — they get their one language from the
 * root layout (lib/i18n/client.tsx).
 */

const flatCache = new Map<Locale, Messages>();

/** One language's messages, English filling any gaps, flat by key. */
export function messagesFor(locale: Locale): Messages {
  const cached = flatCache.get(locale);
  if (cached) return cached;
  const flat: Messages = {};
  for (const namespace of NAMESPACES) {
    const base = english[namespace] as Record<string, string>;
    const translated = (catalogs[locale] as Record<string, Record<string, string>>)[namespace] ?? {};
    for (const [key, value] of Object.entries(base)) {
      flat[`${namespace}.${key}`] = translated[key] || value;
    }
  }
  flatCache.set(locale, flat);
  return flat;
}

const translatorCache = new Map<Locale, Translator>();

/** `t` for a given language — a notification's recipient's, say. */
export function translatorFor(locale: Locale): Translator {
  let t = translatorCache.get(locale);
  if (!t) {
    t = createTranslator(locale, messagesFor(locale));
    translatorCache.set(locale, t);
  }
  return t;
}

/** English, for the places with no reader to ask (logs, tests). */
export function englishT(): Translator {
  return translatorFor(DEFAULT_LOCALE);
}
