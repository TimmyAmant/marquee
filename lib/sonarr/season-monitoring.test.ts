import { describe, it, expect } from "vitest";
import { seasonsForAdd, seasonsForUpdate, seasonsForWholeSeries, seasonsSonarrKnows } from "./season-monitoring";
import { buildAddSeriesBody, buildMonitorSeasonsBody, buildMonitorWholeSeriesBody, type SonarrSeriesLookupResult } from "./client";

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

describe("seasonsForUpdate on a series someone stopped monitoring", () => {
  it("turns on only the requested season, not the seasons still flagged underneath", () => {
    // "Stop monitoring" turns the series off and leaves each season's flag on.
    const current = [
      { seasonNumber: 1, monitored: true },
      { seasonNumber: 2, monitored: true },
      { seasonNumber: 3, monitored: false },
    ];
    expect(seasonsForUpdate(current, [3], false)).toEqual([
      { seasonNumber: 1, monitored: false },
      { seasonNumber: 2, monitored: false },
      { seasonNumber: 3, monitored: true },
    ]);
    expect(buildMonitorSeasonsBody({ id: 7, monitored: false, seasons: current }, [3]).seasons.map((x) => x.monitored)).toEqual([
      false,
      false,
      true,
    ]);
  });
});

describe("seasonsForWholeSeries", () => {
  it("turns every season on, and specials only if they already were", () => {
    const current = [
      { seasonNumber: 0, monitored: false },
      { seasonNumber: 1, monitored: false },
      { seasonNumber: 2, monitored: true },
      { seasonNumber: 3, monitored: false },
    ];
    expect(seasonsForWholeSeries(current).map((x) => x.monitored)).toEqual([false, true, true, true]);
    expect(seasonsForWholeSeries([{ seasonNumber: 0, monitored: true }]).map((x) => x.monitored)).toEqual([true]);
    expect(seasonsForWholeSeries([{ seasonNumber: 0, monitored: true }], false).map((x) => x.monitored)).toEqual([false]);
  });

  it("builds the PUT body with the series monitored and its other fields kept", () => {
    const body = buildMonitorWholeSeriesBody({ id: 7, title: "Severance", monitored: false, seasons: [{ seasonNumber: 1, monitored: false }] });
    expect(body).toEqual({ id: 7, title: "Severance", monitored: true, seasons: [{ seasonNumber: 1, monitored: true }] });
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
      // The series was off, so season 1's leftover flag wasn't being fetched
      // and stays off; only the requested season comes on.
      seasons: [
        { seasonNumber: 1, monitored: false },
        { seasonNumber: 2, monitored: true },
      ],
    });
  });
});
