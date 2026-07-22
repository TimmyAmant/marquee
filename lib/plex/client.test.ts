import { describe, it, expect } from "vitest";
import { parseExternalIds, pickBestConnection, getFileSize, getFilePath, commonFolder } from "./client";

describe("parseExternalIds", () => {
  it("parses tmdb/tvdb/imdb guids from the Guid array", () => {
    const result = parseExternalIds({
      ratingKey: "1",
      type: "movie",
      title: "Test",
      addedAt: 0,
      Guid: [{ id: "tmdb://603" }, { id: "tvdb://2288" }, { id: "imdb://tt0455275" }],
    });
    expect(result).toEqual({ tmdbId: 603, tvdbId: 2288, imdbId: "tt0455275" });
  });

  it("falls back to the single legacy `guid` field when Guid[] is absent", () => {
    const result = parseExternalIds({
      ratingKey: "1",
      type: "movie",
      title: "Test",
      addedAt: 0,
      guid: "tmdb://603",
    });
    expect(result.tmdbId).toBe(603);
  });

  it("returns nulls for a guid format it doesn't recognize (e.g. legacy agent guids)", () => {
    const result = parseExternalIds({
      ratingKey: "1",
      type: "show",
      title: "Test",
      addedAt: 0,
      guid: "com.plexapp.agents.thetvdb://2288?lang=en",
    });
    expect(result).toEqual({ tmdbId: null, tvdbId: null, imdbId: null });
  });

  it("returns nulls when there are no guids at all", () => {
    expect(parseExternalIds({ ratingKey: "1", type: "movie", title: "Test", addedAt: 0 })).toEqual({
      tmdbId: null,
      tvdbId: null,
      imdbId: null,
    });
  });
});

describe("pickBestConnection", () => {
  it("prefers a local, non-relay connection", () => {
    const uri = pickBestConnection([
      { uri: "https://relay", local: false, relay: true },
      { uri: "https://local", local: true, relay: false },
      { uri: "https://remote", local: false, relay: false },
    ]);
    expect(uri).toBe("https://local");
  });

  it("falls back to any direct (non-relay) connection when no local one exists", () => {
    const uri = pickBestConnection([
      { uri: "https://relay", local: false, relay: true },
      { uri: "https://remote", local: false, relay: false },
    ]);
    expect(uri).toBe("https://remote");
  });

  it("falls back to the first connection when everything is a relay", () => {
    const uri = pickBestConnection([{ uri: "https://relay", local: false, relay: true }]);
    expect(uri).toBe("https://relay");
  });

  it("returns null for an empty connection list", () => {
    expect(pickBestConnection([])).toBeNull();
  });
});

describe("getFileSize / getFilePath", () => {
  it("reads size/path off the first Media/Part entry", () => {
    const item = {
      ratingKey: "1",
      type: "movie" as const,
      title: "Test",
      addedAt: 0,
      Media: [{ Part: [{ size: 12345, file: "/movies/test.mkv" }] }],
    };
    expect(getFileSize(item)).toBe(12345);
    expect(getFilePath(item)).toBe("/movies/test.mkv");
  });

  it("returns null when there's no Media/Part at all", () => {
    const item = { ratingKey: "1", type: "show" as const, title: "Test", addedAt: 0 };
    expect(getFileSize(item)).toBeNull();
    expect(getFilePath(item)).toBeNull();
  });
});

describe("commonFolder", () => {
  it("collapses multiple seasons down to the show's shared root folder", () => {
    const result = commonFolder([
      "/tv/Lost Identity (2024)/Season 01/S01E01.mkv",
      "/tv/Lost Identity (2024)/Season 01/S01E02.mkv",
      "/tv/Lost Identity (2024)/Season 02/S02E01.mkv",
    ]);
    expect(result).toBe("/tv/Lost Identity (2024)");
  });

  it("returns the season folder itself when only one season is present", () => {
    const result = commonFolder([
      "/tv/Show/Season 01/S01E01.mkv",
      "/tv/Show/Season 01/S01E02.mkv",
    ]);
    expect(result).toBe("/tv/Show/Season 01");
  });

  it("doesn't false-positive on shows whose names share a string prefix", () => {
    // "/tv/Show 1" is NOT a valid common ancestor of these two — the
    // comparison has to be per path segment, not a raw string prefix.
    const result = commonFolder(["/tv/Show 1/ep.mkv", "/tv/Show 10/ep.mkv"]);
    expect(result).toBe("/tv");
  });

  it("returns null for a single file with no folder above the root", () => {
    expect(commonFolder(["/ep.mkv"])).toBeNull();
  });

  it("returns null for an empty list", () => {
    expect(commonFolder([])).toBeNull();
  });
});
