import { describe, it, expect } from "vitest";
import { findGenreMatch, normalizeForThemeMatch } from "./theme";

const genres = [
  { id: 28, name: "Action" },
  { id: 80, name: "Crime" },
  { id: 878, name: "Science Fiction" },
];

describe("normalizeForThemeMatch", () => {
  it("strips media-type words and collapses whitespace", () => {
    expect(normalizeForThemeMatch("action movies")).toBe("action");
    expect(normalizeForThemeMatch("national disaster movies and tv shows")).toBe("national disaster and");
    expect(normalizeForThemeMatch("  Films  ")).toBe("");
  });
});

describe("findGenreMatch", () => {
  it("matches exact genre names case-insensitively", () => {
    expect(findGenreMatch(genres, "crime")?.id).toBe(80);
  });

  it("allows partial matches for short queries", () => {
    expect(findGenreMatch(genres, "sci")?.id).toBe(878);
    expect(findGenreMatch(genres, "science fiction")?.id).toBe(878);
  });

  it("doesn't treat long titles containing a genre word as a genre search", () => {
    expect(findGenreMatch(genres, "crime and punishment")).toBeNull();
  });

  it("returns null for an empty query", () => {
    expect(findGenreMatch(genres, "")).toBeNull();
  });
});
