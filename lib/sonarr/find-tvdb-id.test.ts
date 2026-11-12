import { afterEach, describe, expect, it, vi } from "vitest";
import { findTvdbId, pickTvdbId, type SonarrSeriesLookupResult } from "./client";

const show = (fields: Partial<SonarrSeriesLookupResult>): SonarrSeriesLookupResult => ({
  title: "Show",
  tvdbId: 0,
  images: [],
  seasons: [],
  year: 2026,
  ...fields,
});

// What Sonarr answers for `tmdb:322267` (Newlyweds, 2026): the show itself,
// plus an unrelated one whose TVDB id happens to be 322267.
const newlyweds = show({ title: "Newlyweds (2026)", tvdbId: 477713, tmdbId: 322267, imdbId: "tt39469996" });
const sameNumber = show({ title: "Galli Lucha Libre", tvdbId: 322267 });

describe("pickTvdbId", () => {
  it("takes the result with the same TMDb id, not one whose TVDB id is that number", () => {
    expect(pickTvdbId([sameNumber, newlyweds], { tmdbId: 322267 })).toBe(477713);
  });

  it("matches on IMDb id when Sonarr doesn't know the TMDb id", () => {
    const noTmdb = { ...newlyweds, tmdbId: 0 };
    expect(pickTvdbId([noTmdb], { tmdbId: 322267, imdbId: "tt39469996" })).toBe(477713);
  });

  it("finds nothing rather than guessing", () => {
    expect(pickTvdbId([sameNumber], { tmdbId: 322267, imdbId: "tt39469996" })).toBeNull();
    expect(pickTvdbId([show({ tvdbId: 1 })], { tmdbId: 5, imdbId: null })).toBeNull();
  });
});

describe("findTvdbId", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("falls back to an IMDb lookup when the TMDb one has no match", async () => {
    const terms: string[] = [];
    vi.stubGlobal("fetch", async (url: URL) => {
      const term = url.searchParams.get("term")!;
      terms.push(term);
      return Response.json(term.startsWith("imdb:") ? [{ ...newlyweds, tmdbId: 0 }] : [sameNumber]);
    });
    const config = { baseUrl: "http://sonarr.test", apiKey: "k" };
    expect(await findTvdbId(config, { tmdbId: 322267, imdbId: "tt39469996" })).toBe(477713);
    expect(terms).toEqual(["tmdb:322267", "imdb:tt39469996"]);
  });
});
