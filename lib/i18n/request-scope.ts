import { AsyncLocalStorage } from "node:async_hooks";

/**
 * The /api/v1 side of "whose language is this request in". The apps sign in
 * with a token, not the browser session getLocale() reads, so withApi runs
 * each API request in a scope and authentication records the account's
 * chosen language in it (lib/api/auth.ts). getLocale() then prefers it over
 * Accept-Language, exactly as the website prefers the session's.
 */

type Scope = { acceptLanguage: string | null; language?: string | null };

const storage = new AsyncLocalStorage<Scope>();

/** `acceptLanguage`: the request's own header, for before (or without)
 * a signed-in account. */
export function runInLanguageScope<T>(acceptLanguage: string | null, fn: () => Promise<T>): Promise<T> {
  return storage.run({ acceptLanguage }, fn);
}

/** Called once the request's account is known. */
export function setScopedLanguage(language: string | null): void {
  const scope = storage.getStore();
  if (scope) scope.language = language;
}

/** Inside an API request: its account's language (undefined until
 * known) and its Accept-Language. Null outside one. */
export function apiScope(): { language: string | null | undefined; acceptLanguage: string | null } | null {
  const scope = storage.getStore();
  return scope ? { language: scope.language, acceptLanguage: scope.acceptLanguage } : null;
}
