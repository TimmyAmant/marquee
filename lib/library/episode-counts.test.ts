import { describe, expect, it } from "vitest";
import {
  isEpisodeCountComplete,
  pickEpisodeCounts,
  regularEpisodeCount,
  sonarrEpisodeCounts,
  tmdbAiredEpisodeCount,
} from "@/lib/library/episode-counts";
import { countEpisodeFilesBySeries } from "@/lib/jellyfin/client";

// A series poster's "have/total": aired episodes only, specials left out,
// Sonarr first and the media servers against TMDb after.

describe("sonarrEpisodeCounts", () => {
  it("counts aired episodes and files across the regular seasons, leaving specials out", () => {
    const counts = sonarrEpisodeCounts([
      { seasonNumber: 0, monitored: false, statistics: { episodeFileCount: 4, episodeCount: 4, totalEpisodeCount: 30 } },
      { seasonNumber: 1, monitored: true, statistics: { episodeFileCount: 12, episodeCount: 12, totalEpisodeCount: 12 } },
      { seasonNumber: 2, monitored: true, statistics: { episodeFileCount: 12, episodeCount: 12, totalEpisodeCount: 12 } },
    ]);
    expect(counts).toEqual({ have: 24, total: 24 });
  });

  it("leaves episodes still to air out of the total", () => {
    // Season 3 is airing: 4 of its 10 have aired (Sonarr's episodeCount), 3 are on disk.
    const counts = sonarrEpisodeCounts([
      { seasonNumber: 1, monitored: true, statistics: { episodeFileCount: 10, episodeCount: 10, totalEpisodeCount: 10 } },
      {
        seasonNumber: 3,
        monitored: true,
        statistics: { episodeFileCount: 3, episodeCount: 4, totalEpisodeCount: 10, nextAiring: "2026-10-01T02:00:00Z" },
      },
    ]);
    expect(counts).toEqual({ have: 13, total: 14 });
  });

  it("counts an unmonitored season that has finished airing in full", () => {
    // Sonarr's episodeCount for an unmonitored season is just its files.
    const counts = sonarrEpisodeCounts([
      { seasonNumber: 1, monitored: true, statistics: { episodeFileCount: 8, episodeCount: 8, totalEpisodeCount: 8 } },
      { seasonNumber: 2, monitored: false, statistics: { episodeFileCount: 2, episodeCount: 2, totalEpisodeCount: 8 } },
    ]);
    expect(counts).toEqual({ have: 10, total: 16 });
  });

  it("treats every season as unmonitored when the series is", () => {
    const counts = sonarrEpisodeCounts(
      [{ seasonNumber: 1, monitored: true, statistics: { episodeFileCount: 0, episodeCount: 0, totalEpisodeCount: 6 } }],
      false,
    );
    expect(counts).toEqual({ have: 0, total: 6 });
  });

  it("counts files for episodes that haven't aired, for the poster to cap", () => {
    const counts = sonarrEpisodeCounts([
      { seasonNumber: 1, monitored: true, statistics: { episodeFileCount: 5, episodeCount: 3, totalEpisodeCount: 5, nextAiring: "2026-10-01" } },
    ]);
    expect(counts).toEqual({ have: 5, total: 3 });
    expect(pickEpisodeCounts({ sonarr: counts, mediaServerHave: null, tmdbAired: null })).toEqual({ have: 3, total: 3 });
  });

  it("has nothing to say without a regular season", () => {
    expect(sonarrEpisodeCounts(undefined)).toBeNull();
    expect(sonarrEpisodeCounts([{ seasonNumber: 0, monitored: true, statistics: { episodeFileCount: 1, episodeCount: 1 } }])).toBeNull();
  });
});

describe("tmdbAiredEpisodeCount", () => {
  it("adds the finished seasons to the latest one up to its last aired episode, specials left out", () => {
    const aired = tmdbAiredEpisodeCount({
      seasons: [
        { season_number: 0, episode_count: 7 },
        { season_number: 1, episode_count: 12 },
        { season_number: 2, episode_count: 12 },
        { season_number: 3, episode_count: 10 },
      ],
      last_episode_to_air: { season_number: 3, episode_number: 4, air_date: "2026-09-20" },
    });
    expect(aired).toBe(28);
  });

  it("is null when nothing has aired", () => {
    expect(tmdbAiredEpisodeCount({ seasons: [{ season_number: 1, episode_count: 8 }], last_episode_to_air: null })).toBeNull();
    expect(tmdbAiredEpisodeCount(null)).toBeNull();
    // The latest thing that aired was a special.
    expect(tmdbAiredEpisodeCount({ seasons: [], last_episode_to_air: { season_number: 0, episode_number: 2 } })).toBeNull();
  });
});

describe("regularEpisodeCount", () => {
  it("leaves specials out and counts an episode of unknown season", () => {
    expect(regularEpisodeCount([{ seasonNumber: 0 }, { seasonNumber: 1 }, { seasonNumber: 2 }, { seasonNumber: undefined }])).toBe(3);
  });
});

describe("countEpisodeFilesBySeries (Jellyfin)", () => {
  it("counts each series' episodes on disk, not specials or missing ones", () => {
    const counts = countEpisodeFilesBySeries([
      { SeriesId: "a", ParentIndexNumber: 1 },
      { SeriesId: "a", ParentIndexNumber: 1 },
      { SeriesId: "a", ParentIndexNumber: 0 },
      { SeriesId: "a", ParentIndexNumber: 2, LocationType: "Virtual" },
      { SeriesId: "b", ParentIndexNumber: 1, LocationType: "FileSystem" },
      { ParentIndexNumber: 1 },
    ]);
    expect(Object.fromEntries(counts)).toEqual({ a: 2, b: 1 });
  });
});

describe("pickEpisodeCounts", () => {
  it("prefers Sonarr", () => {
    expect(pickEpisodeCounts({ sonarr: { have: 120, total: 125 }, mediaServerHave: 96, tmdbAired: 96 })).toEqual({ have: 120, total: 125 });
  });

  it("falls back to the media server's files against TMDb's aired episodes", () => {
    expect(pickEpisodeCounts({ sonarr: null, mediaServerHave: 96, tmdbAired: 96 })).toEqual({ have: 96, total: 96 });
    // A Sonarr row from before the columns existed.
    expect(pickEpisodeCounts({ sonarr: { have: null, total: null }, mediaServerHave: 10, tmdbAired: 12 })).toEqual({ have: 10, total: 12 });
  });

  it("never shows more than complete", () => {
    expect(pickEpisodeCounts({ sonarr: { have: 63, total: 62 }, mediaServerHave: null, tmdbAired: null })).toEqual({ have: 62, total: 62 });
    expect(pickEpisodeCounts({ sonarr: null, mediaServerHave: 63, tmdbAired: 62 })).toEqual({ have: 62, total: 62 });
    expect(pickEpisodeCounts({ sonarr: null, mediaServerHave: 61, tmdbAired: 62 })).toEqual({ have: 61, total: 62 });
  });

  it("shows nothing without both numbers, or before anything has aired", () => {
    expect(pickEpisodeCounts({ sonarr: null, mediaServerHave: null, tmdbAired: 12 })).toBeNull();
    expect(pickEpisodeCounts({ sonarr: null, mediaServerHave: 3, tmdbAired: null })).toBeNull();
    expect(pickEpisodeCounts({ sonarr: { have: 0, total: 0 }, mediaServerHave: null, tmdbAired: null })).toBeNull();
  });
});

describe("isEpisodeCountComplete", () => {
  it("is complete once every aired episode is on disk", () => {
    expect(isEpisodeCountComplete({ have: 96, total: 96 })).toBe(true);
    expect(isEpisodeCountComplete({ have: 120, total: 125 })).toBe(false);
  });
});
