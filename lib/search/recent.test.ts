import { afterEach, describe, expect, it, vi } from "vitest";
import {
  RECENT_SEARCH_LIMIT,
  addRecentSearch,
  clearSearchHistory,
  isSearchHistoryKey,
  lastSearchKey,
  parseRecentSearches,
  readRecentSearches,
  recentSearchesKey,
  removeRecentSearch,
  rememberSearch,
} from "./recent";

/** A Map-backed Storage, enough for these helpers. */
function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    clear: () => map.clear(),
  };
}

describe("recent searches", () => {
  it("puts the newest first and moves a repeat up instead of keeping it twice", () => {
    let list = addRecentSearch([], "dune");
    list = addRecentSearch(list, "The Lincoln Lawyer");
    list = addRecentSearch(list, "DUNE");
    expect(list).toEqual(["DUNE", "The Lincoln Lawyer"]);
  });

  it("treats spellings of the same search as one", () => {
    expect(addRecentSearch(["wall·e"], "Wall-E")).toEqual(["Wall-E"]);
  });

  it("ignores a blank search and keeps only the latest few", () => {
    expect(addRecentSearch(["dune"], "   ")).toEqual(["dune"]);
    const many = Array.from({ length: RECENT_SEARCH_LIMIT + 3 }, (_, i) => `title ${i}`).reduce(addRecentSearch, [] as string[]);
    expect(many).toHaveLength(RECENT_SEARCH_LIMIT);
    expect(many[0]).toBe(`title ${RECENT_SEARCH_LIMIT + 2}`);
  });

  it("removes one", () => {
    expect(removeRecentSearch(["a", "b"], "a")).toEqual(["b"]);
  });

  it("reads back only a list of strings", () => {
    expect(parseRecentSearches('["dune","",3,"alien"]')).toEqual(["dune", "alien"]);
    expect(parseRecentSearches("{")).toEqual([]);
    expect(parseRecentSearches('{"a":1}')).toEqual([]);
    expect(parseRecentSearches(null)).toEqual([]);
  });
});

describe("search history per account", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keys each account separately", () => {
    expect(recentSearchesKey("a")).not.toBe(recentSearchesKey("b"));
    expect(lastSearchKey("a")).not.toBe(lastSearchKey("b"));
    expect(isSearchHistoryKey(recentSearchesKey("a"))).toBe(true);
    expect(isSearchHistoryKey(lastSearchKey("a"))).toBe(true);
    // The shared key older versions used.
    expect(isSearchHistoryKey("marquee.recentSearches")).toBe(true);
    expect(isSearchHistoryKey("marquee.recentSearchesX")).toBe(false);
    expect(isSearchHistoryKey("marquee-push-prompt-dismissed")).toBe(false);
  });

  it("never shows one account's searches to another, and clears them all", () => {
    const local = memoryStorage();
    const session = memoryStorage();
    vi.stubGlobal("localStorage", local);
    vi.stubGlobal("sessionStorage", session);
    rememberSearch("alice", "dune");
    expect(readRecentSearches("bob")).toEqual([]);
    expect(readRecentSearches("alice")).toEqual(["dune"]);

    local.setItem("marquee.recentSearches", '["old"]');
    local.setItem("unrelated", "1");
    session.setItem(lastSearchKey("alice"), "{}");
    clearSearchHistory();
    expect(readRecentSearches("alice")).toEqual([]);
    expect(local.getItem("marquee.recentSearches")).toBeNull();
    expect(local.getItem("unrelated")).toBe("1");
    expect(session.length).toBe(0);
  });
});
