import { formatMessage, type MessageValues } from "@/lib/i18n/format-message";
import { intlTag, type Locale } from "@/lib/i18n/locales";
import type { english } from "@/lib/i18n/messages";

/**
 * Looking up and filling in translated messages. Pure, and free of the
 * message files themselves (lib/i18n/catalog.ts loads those), so the
 * browser bundle only ever carries the one language the page is in.
 *
 * Keys are "namespace.key" — the file under lib/i18n/messages/<language>/
 * and the key inside it — and only English's keys type-check, so a typo is
 * a compile error.
 */

type English = typeof english;

export type Namespace = keyof English;

export type MessageKey = {
  [N in Namespace]: `${N}.${keyof English[N] & string}`;
}[Namespace];

export type { MessageValues };

/** Every message of one language, English filling any gaps, flat by key. */
export type Messages = Record<string, string>;

export type Translator = {
  (key: MessageKey, values?: MessageValues): string;
  locale: Locale;
  /** The Intl tag for dates and numbers ("en-US", "fr"). */
  tag: string;
};

export function createTranslator(locale: Locale, messages: Messages): Translator {
  const tag = intlTag(locale);
  const t = ((key: MessageKey, values?: MessageValues) => {
    const message = messages[key];
    // An unknown key shows as itself: easy to spot, never a crash.
    if (message === undefined) return key;
    return formatMessage(message, values, tag);
  }) as Translator;
  t.locale = locale;
  t.tag = tag;
  return t;
}
