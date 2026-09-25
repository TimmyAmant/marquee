import { describe, it, expect } from "vitest";
import { seasonsForAdd, seasonsForUpdate, seasonsSonarrKnows } from "./season-monitoring";
import { buildAddSeriesBody, buildMonitorSeasonsBody, type SonarrSeriesLookupResult } from "./client";

const lookupResult: SonarrSeriesLookupResult = {
  title: "Severance",
  tvdbId: 371980,
  images: [],
  year: 2022,
  seasons: [
    { seasonNumber: 0, monitored: false },
    { seasonNumber: 1, monitored: true },
    { seasonNumber: 2, monitored: true },
  ],
};

describe("seasonsForAdd", () => {
  it("monitors exactly the requested seasons", () => {
    expect(seasonsForAdd(lookupResult.seasons, [2])).toEqual([
      { seasonNumber: 0, monitored: false },
      { seasonNumber: 1, monitored: false },
      { seasonNumber: 2, monitored: true },
    ]);
  });

  it("keeps every other field Sonarr reported for a season", () => {
    const seasons = [{ seasonNumber: 1, monitored: false, statistics: { episodeCount: 9 } }];
    expect(seasonsForAdd(seasons, [1])).toEqual([{ seasonNumber: 1, monitored: true, statistics: { episodeCount: 9 } }]);
  });
});

describe("seasonsForUpdate", () => {
  it("adds the requested seasons without unmonitoring anything", () => {
    const current = [
      { seasonNumber: 1, monitored: true },
      { seasonNumber: 2, monitored: false },
      { seasonNumber: 3, monitored: false },
    ];
    expect(seasonsForUpdate(current, [3])).toEqual([
      { seasonNumber: 1, monitored: true },
      { seasonNumber: 2, monitored: false },
      { seasonNumber: 3, monitored: true },
    ]);
  });
});

describe("seasonsSonarrKnows", () => {
  it("keeps only seasons Sonarr lists", () => {
    expect(seasonsSonarrKnows(lookupResult.seasons, [1, 2, 5])).toEqual([1, 2]);
    expect(seasonsSonarrKnows(lookupResult.seasons, [5])).toEqual([]);
  });
});

describe("buildAddSeriesBody", () => {
  const base = { lookupResult, qualityProfileId: 4, rootFolderPath: "/tv" };

  it("is unchanged for a whole-series add", () => {
    const expected = {
      ...lookupResult,
      qualityProfileId: 4,
      rootFolderPath: "/tv",
      monitored: true,
      addOptions: { searchForMissingEpisodes: true },
    };
    expect(JSON.stringify(buildAddSeriesBody(base))).toBe(JSON.stringify(expected));
    expect(JSON.stringify(buildAddSeriesBody({ ...base, seasons: null }))).toBe(JSON.stringify(expected));
  });

  it("monitors only the requested seasons and searches on add", () => {
    const body = buildAddSeriesBody({ ...base, seasons: [1] });
    expect(body.monitored).toBe(true);
    expect(body.seasons).toEqual([
      { seasonNumber: 0, monitored: false },
      { seasonNumber: 1, monitored: true },
      { seasonNumber: 2, monitored: false },
    ]);
    expect(body.addOptions).toEqual({ searchForMissingEpisodes: true });
  });
});

describe("buildMonitorSeasonsBody", () => {
  it("monitors the series and the requested seasons, passing everything else through", () => {
    const series = {
      id: 7,
      title: "Severance",
      monitored: false,
      path: "/tv/Severance",
      seasons: [
        { seasonNumber: 1, monitored: true },
        { seasonNumber: 2, monitored: false },
      ],
    };
    expect(buildMonitorSeasonsBody(series, [2])).toEqual({
      id: 7,
      title: "Severance",
      monitored: true,
      path: "/tv/Severance",
      seasons: [
        { seasonNumber: 1, monitored: true },
        { seasonNumber: 2, monitored: true },
      ],
    });
  });
});
