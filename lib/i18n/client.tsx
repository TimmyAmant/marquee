"use client";

import { createContext, useContext, useMemo } from "react";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales";
import { createTranslator, type Messages, type Translator } from "@/lib/i18n/translator";

/**
 * The browser's side of lib/i18n. The root layout works out the language on
 * the server (lib/i18n/server.ts) and hands it down with that language's
 * messages, so Client Components translate with `const t = useT()` and the
 * server-rendered HTML already matches what hydrates.
 */

type I18nValue = { locale: Locale; t: Translator };

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({
  locale,
  messages,
  children,
}: {
  locale: Locale;
  messages: Messages;
  children: React.ReactNode;
}) {
  const value = useMemo(() => ({ locale, t: createTranslator(locale, messages) }), [locale, messages]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

let englishFallback: Translator | null = null;

function fallback(): I18nValue {
  // Only outside the provider (an isolated test render): keys as they are.
  englishFallback ??= createTranslator(DEFAULT_LOCALE, {});
  return { locale: DEFAULT_LOCALE, t: englishFallback };
}

/** `t` in this page's language. */
export function useT(): Translator {
  return (useContext(I18nContext) ?? fallback()).t;
}

/** This page's language ("en", "fr", …). */
export function useLocale(): Locale {
  return (useContext(I18nContext) ?? fallback()).locale;
}
