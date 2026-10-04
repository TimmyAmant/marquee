import { describe, expect, it } from "vitest";
import { RECENT_SEARCH_LIMIT, addRecentSearch, parseRecentSearches, removeRecentSearch } from "./recent";

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
