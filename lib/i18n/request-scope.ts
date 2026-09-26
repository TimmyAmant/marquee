import { AsyncLocalStorage } from "node:async_hooks";

/**
 * The /api/v1 side of "whose language is this request in". The apps sign in
 * with a token, not the browser session getLocale() reads, so withApi runs
 * each API request in a scope and authentication records the account's
 * chosen language in it (lib/api/auth.ts). getLocale() then prefers it over
 * Accept-Language, exactly as the website prefers the session's.
 */

type Scope = { language?: string | null };

const storage = new AsyncLocalStorage<Scope>();

export function runInLanguageScope<T>(fn: () => Promise<T>): Promise<T> {
  return storage.run({}, fn);
}

/** Called once the request's account is known. */
export function setScopedLanguage(language: string | null): void {
  const scope = storage.getStore();
  if (scope) scope.language = language;
}

/** The API request's account language: undefined when this isn't an API
 * request or its account isn't known (yet); null when it follows the app. */
export function scopedLanguage(): string | null | undefined {
  return storage.getStore()?.language;
}

/** True inside an API request, where the browser session doesn't apply. */
export function inApiScope(): boolean {
  return storage.getStore() !== undefined;
}
