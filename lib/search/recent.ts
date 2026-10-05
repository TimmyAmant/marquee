// Recent searches, and the last search to bring back when the viewer comes
// back to the search page — both kept in the browser only.
//
// Recent searches: the last few things searched for on this device, newest
// first, shown under an empty search box to search again with a tap. The
// last search: what was typed and its suggestions when a suggestion was
// picked, so swiping back from that title lands on the same open list
// instead of an empty box.
//
// Both are kept per account (keyed by user id, like What's New), so someone
// else signing in on the same browser never sees them, and both are wiped
// on signing out and when the sign-in form is used (clearSearchHistory).

import { normalizeName } from "@/lib/search/rank";

export const RECENT_SEARCH_LIMIT = 8;
const RECENT_PREFIX = "marquee.recentSearches";
const LAST_PREFIX = "marquee.lastSearch";

export function recentSearchesKey(userId: string): string {
  return `${RECENT_PREFIX}:${userId}`;
}

export function lastSearchKey(userId: string): string {
  return `${LAST_PREFIX}:${userId}`;
}

/** The query added to the front; the same query typed differently ("Wall-E"
 * and "wall-e") is moved up rather than kept twice. Blank is ignored. */
export function addRecentSearch(list: readonly string[], query: string): string[] {
  const trimmed = query.trim();
  if (!trimmed) return [...list];
  const key = normalizeName(trimmed) || trimmed.toLowerCase();
  const rest = list.filter((item) => (normalizeName(item) || item.toLowerCase()) !== key);
  return [trimmed, ...rest].slice(0, RECENT_SEARCH_LIMIT);
}

export function removeRecentSearch(list: readonly string[], query: string): string[] {
  return list.filter((item) => item !== query);
}

/** What storage held, or [] for anything that isn't a list of strings. */
export function parseRecentSearches(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string" && item.trim() !== "").slice(0, RECENT_SEARCH_LIMIT);
  } catch {
    return [];
  }
}

export function readRecentSearches(userId: string): string[] {
  try {
    return parseRecentSearches(localStorage.getItem(recentSearchesKey(userId)));
  } catch {
    return [];
  }
}

export function saveRecentSearches(userId: string, list: readonly string[]) {
  try {
    if (list.length === 0) localStorage.removeItem(recentSearchesKey(userId));
    else localStorage.setItem(recentSearchesKey(userId), JSON.stringify(list));
  } catch {
    // Storage blocked: there are just no recent searches.
  }
}

/** Adds a search to this device's recent searches. */
export function rememberSearch(userId: string, query: string): string[] {
  const next = addRecentSearch(readRecentSearches(userId), query);
  saveRecentSearches(userId, next);
  return next;
}

export type LastSearch<S> = { query: string; suggestions: S[] };

/** Kept for this tab only (sessionStorage), like the back button's history. */
export function saveLastSearch<S>(userId: string, last: LastSearch<S>) {
  try {
    sessionStorage.setItem(lastSearchKey(userId), JSON.stringify(last));
  } catch {
    // Storage blocked: coming back shows an empty box, as before.
  }
}

export function readLastSearch<S>(userId: string): LastSearch<S> | null {
  try {
    const raw = sessionStorage.getItem(lastSearchKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LastSearch<S>>;
    if (typeof parsed.query !== "string" || !parsed.query.trim() || !Array.isArray(parsed.suggestions)) return null;
    return { query: parsed.query, suggestions: parsed.suggestions };
  } catch {
    return null;
  }
}

/** Whether a storage key is search history (any account's, or the single
 * shared key older versions used). */
export function isSearchHistoryKey(key: string): boolean {
  return [RECENT_PREFIX, LAST_PREFIX].some((prefix) => key === prefix || key.startsWith(`${prefix}:`));
}

function clearFrom(storage: Storage) {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key && isSearchHistoryKey(key)) keys.push(key);
  }
  for (const key of keys) storage.removeItem(key);
}

/** Forgets every account's recent and last searches on this browser:
 * signing out, and before signing in. */
export function clearSearchHistory() {
  try {
    clearFrom(localStorage);
  } catch {
    // Storage blocked: nothing was kept.
  }
  try {
    clearFrom(sessionStorage);
  } catch {
    // As above.
  }
}

// When the browser last went back or forward. The search page only brings
// the last search back when it was reached that way — the Search tab itself
// still opens an empty box (with the recent searches under it).
let lastHistoryNavigationAt = 0;
if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    lastHistoryNavigationAt = Date.now();
  });
}

/** Whether this page was just reached with back/forward. */
export function cameBackJustNow(now = Date.now()): boolean {
  return now - lastHistoryNavigationAt < 3000;
}
