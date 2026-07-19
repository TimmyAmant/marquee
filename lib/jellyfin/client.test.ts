import { describe, it, expect } from "vitest";
import { parseExternalIds, getFileSize } from "./client";

describe("parseExternalIds", () => {
  it("parses tmdb/tvdb/imdb ids from ProviderIds", () => {
    const result = parseExternalIds({
      Id: "1",
      Name: "Test",
      Type: "Movie",
      ProviderIds: { Tmdb: "603", Tvdb: "2288", Imdb: "tt0455275" },
    });
    expect(result).toEqual({ tmdbId: 603, tvdbId: 2288, imdbId: "tt0455275" });
  });

  it("returns nulls when ProviderIds is absent", () => {
    expect(parseExternalIds({ Id: "1", Name: "Test", Type: "Series" })).toEqual({
      tmdbId: null,
      tvdbId: null,
      imdbId: null,
    });
  });

  it("returns nulls for empty-string provider ids rather than NaN", () => {
    const result = parseExternalIds({
      Id: "1",
      Name: "Test",
      Type: "Movie",
      ProviderIds: { Tmdb: "" },
    });
    expect(result.tmdbId).toBeNull();
  });
});

describe("getFileSize", () => {
  it("reads size off the first MediaSources entry", () => {
    expect(getFileSize({ Id: "1", Name: "Test", Type: "Movie", MediaSources: [{ Size: 5000 }] })).toBe(
      5000,
    );
  });

  it("returns null when there are no MediaSources", () => {
    expect(getFileSize({ Id: "1", Name: "Test", Type: "Movie" })).toBeNull();
  });
});
