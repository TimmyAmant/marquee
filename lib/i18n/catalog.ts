import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales";
import { catalogs, english, NAMESPACES } from "@/lib/i18n/messages";
import { createTranslator, type MessageKey, type Messages, type Namespace, type Translator } from "@/lib/i18n/translator";

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

/**
 * What the browser gets (the root layout hands it to lib/i18n/client.tsx,
 * and it rides along again on every router.refresh()): the namespaces
 * Client Components translate from, whole, plus the handful of keys they
 * use from the server's own namespaces — help pages, server errors and
 * notification text, which make up a third of the catalog and otherwise
 * never leave the server. lib/i18n/client-catalog.test.ts walks every
 * Client Component and what it imports and fails when one uses a key this
 * leaves out.
 */
export const CLIENT_NAMESPACES = [
  "common",
  "nav",
  "auth",
  "discover",
  "title",
  "requests",
  "settings",
  "integrations",
  "admin",
  "library",
] as const satisfies readonly Namespace[];

export const CLIENT_EXTRA_KEYS = [
  // components/status-legend.tsx
  "help.colorKey",
  "help.colorsDialogLabel",
  "help.colorsQuestion",
  "help.moreAboutColors",
  // lib/push/browser.ts
  "notify.pushBlocked",
  "notify.pushEnableFailed",
  // lib/requests/labels.ts
  "notify.requestIn4k",
  // lib/sharing/parse.ts
  "notify.noteTooLong",
  "notify.shareNotYourself",
  "notify.shareNoteNotText",
  "notify.sharePickWho",
  "notify.shareTooMany",
  "notify.titleShared",
  "notify.titleSharedWithNote",
  // lib/users/permissions.ts
  "server.noSuchPermission",
  "server.permissionTrueOrFalse",
  "server.permissionsShape",
] as const satisfies readonly MessageKey[];

const clientCache = new Map<Locale, Messages>();

/** One language's messages for the browser (see CLIENT_NAMESPACES). */
export function clientMessagesFor(locale: Locale): Messages {
  const cached = clientCache.get(locale);
  if (cached) return cached;
  const all = messagesFor(locale);
  const prefixes = CLIENT_NAMESPACES.map((namespace) => `${namespace}.`);
  const subset: Messages = {};
  for (const [key, value] of Object.entries(all)) {
    if (prefixes.some((prefix) => key.startsWith(prefix))) subset[key] = value;
  }
  for (const key of CLIENT_EXTRA_KEYS) subset[key] = all[key];
  clientCache.set(locale, subset);
  return subset;
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
