import { describe, it, expect } from "vitest";
import {
  buildExternalLinks,
  computeYearRange,
  franchiseMissingItems,
  relabelTvStatus,
  seasonsNewestFirst,
  topBilledCast,
} from "./title-meta";

describe("topBilledCast", () => {
  it("orders by billing and keeps the top 20", () => {
    const cast = Array.from({ length: 25 }, (_, i) => ({ id: i, order: 24 - i }));
    const top = topBilledCast(cast);
    expect(top).toHaveLength(20);
    expect(top[0].order).toBe(0);
    expect(top[19].order).toBe(19);
  });
});

describe("seasonsNewestFirst", () => {
  it("drops empty seasons and puts the newest first", () => {
    const seasons = [
      { season_number: 0, episode_count: 3 },
      { season_number: 1, episode_count: 10 },
      { season_number: 2, episode_count: 0 },
      { season_number: 3, episode_count: 8 },
    ];
    expect(seasonsNewestFirst(seasons).map((s) => s.season_number)).toEqual([3, 1, 0]);
  });
});

describe("franchiseMissingItems", () => {
  const items = [
    { mediaType: "movie" as const, tmdbId: 1 },
    { mediaType: "movie" as const, tmdbId: 2 },
    { mediaType: "tv" as const, tmdbId: 3 },
  ];
  const statusKeys = new Set(["movie:1"]);

  it("lists untracked titles whose *arr is configured, for the admin", () => {
    expect(franchiseMissingItems(items, statusKeys, { movie: true, tv: false }, true)).toEqual([
      { mediaType: "movie", tmdbId: 2 },
    ]);
  });

  it("is empty for members and signed-out viewers", () => {
    expect(franchiseMissingItems(items, statusKeys, { movie: true, tv: true }, false)).toEqual([]);
    expect(franchiseMissingItems(items, statusKeys, undefined, undefined)).toEqual([]);
  });
});

describe("buildExternalLinks", () => {
  it("builds links in display order, skipping missing ids", () => {
    expect(
      buildExternalLinks({
        imdbId: "tt0133093",
        facebookId: null,
        instagramId: "thematrix",
        twitterId: "thematrix",
        tvdbId: 169,
        tvdbMediaType: "movies",
      }),
    ).toEqual([
      { label: "IMDb", href: "https://www.imdb.com/title/tt0133093" },
      { label: "TheTVDB", href: "https://www.thetvdb.com/dereferrer/movies/169" },
      { label: "Instagram", href: "https://www.instagram.com/thematrix" },
      { label: "X / Twitter", href: "https://x.com/thematrix" },
    ]);
  });

  it("returns nothing when there are no ids", () => {
    expect(buildExternalLinks({ imdbId: null, facebookId: null, instagramId: null, twitterId: null })).toEqual([]);
  });
});

describe("computeYearRange", () => {
  it("returns a single year for a movie (no end year)", () => {
    expect(computeYearRange("2026", null)).toBe("2026");
  });

  it("returns a range for an ended show", () => {
    expect(computeYearRange("2001", "2011")).toBe("2001–2011");
  });

  it("returns just the start year when start and end are the same", () => {
    expect(computeYearRange("2026", "2026")).toBe("2026");
  });

  it("returns just the end year when the start year is missing — this was the 'null–2020' bug", () => {
    expect(computeYearRange(null, "2020")).toBe("2020");
  });

  it("returns null when neither year is known", () => {
    expect(computeYearRange(null, null)).toBeNull();
  });
});

describe("relabelTvStatus", () => {
  it("relabels TMDb's 'Returning Series' to 'Continuing'", () => {
    expect(relabelTvStatus("Returning Series")).toBe("Continuing");
  });

  it("passes other statuses through unchanged", () => {
    expect(relabelTvStatus("Ended")).toBe("Ended");
    expect(relabelTvStatus("Canceled")).toBe("Canceled");
  });

  it("passes null through", () => {
    expect(relabelTvStatus(null)).toBeNull();
  });
});
