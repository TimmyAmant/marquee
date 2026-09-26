import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({ db: {} }));
vi.mock("@/lib/tmdb/cache", () => ({ getOrFetchTitle: async () => null }));

import { blockedMessage, normalizeKeyword, titleTags } from "./blocklist";

describe("the request blocklist", () => {
  it("compares keywords case- and spacing-insensitively", () => {
    expect(normalizeKeyword("  Anime ")).toBe("anime");
    expect(normalizeKeyword("Martial   Arts")).toBe("martial arts");
    expect(normalizeKeyword(42)).toBe("");
  });

  it("reads a title's TMDb keywords and genres", () => {
    const movie = { keywords: { keywords: [{ id: 1, name: "Anime" }] }, genres: [{ id: 16, name: "Animation" }] };
    expect(titleTags(movie, "movie")).toEqual(["anime", "animation"]);
    const show = { keywords: { results: [{ id: 2, name: "Reality" }] }, genres: [] };
    expect(titleTags(show, "tv")).toEqual(["reality"]);
    expect(titleTags(null, "movie")).toEqual([]);
  });

  it("explains the refusal, with the admin's reason", () => {
    expect(blockedMessage({ reason: null, keyword: null })).toBe("The admin isn't taking requests for this title.");
    expect(blockedMessage({ reason: "Already on Netflix.", keyword: null })).toBe(
      "The admin isn't taking requests for this title. Already on Netflix.",
    );
  });
});
