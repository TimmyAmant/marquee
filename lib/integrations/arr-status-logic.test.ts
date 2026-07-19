import { describe, it, expect } from "vitest";
import { deriveRadarrStatus, deriveSonarrStatus } from "./arr-status-logic";
import type { RadarrMovie } from "@/lib/radarr/client";
import type { SonarrSeries } from "@/lib/sonarr/client";

function movie(overrides: Partial<RadarrMovie> = {}): RadarrMovie {
  return {
    id: 1,
    tmdbId: 100,
    title: "Test Movie",
    status: "released",
    monitored: true,
    hasFile: false,
    ...overrides,
  };
}

function series(overrides: Partial<SonarrSeries> = {}): SonarrSeries {
  return {
    id: 1,
    tvdbId: 200,
    status: "continuing",
    monitored: true,
    ...overrides,
  };
}

describe("deriveRadarrStatus", () => {
  it("is owned when hasFile and movieFile are both present", () => {
    expect(
      deriveRadarrStatus(movie({ hasFile: true, movieFile: { path: "/x.mkv", size: 1, quality: { quality: { name: "Bluray-1080p" } } } })),
    ).toBe("owned");
  });

  it("is untracked when unmonitored with nothing downloaded", () => {
    expect(deriveRadarrStatus(movie({ monitored: false, hasFile: false }))).toBe("untracked");
  });

  it("is coming_soon when monitored but not yet released", () => {
    expect(deriveRadarrStatus(movie({ status: "announced", monitored: true }))).toBe("coming_soon");
  });

  it("is tracked_monitored when released, monitored, and not downloaded", () => {
    expect(deriveRadarrStatus(movie({ status: "released", monitored: true, hasFile: false }))).toBe(
      "tracked_monitored",
    );
  });

  it("prefers owned over the unmonitored/coming_soon checks even if monitored is later turned off", () => {
    // A file already on disk should never be "lost" just because monitoring
    // was toggled off after the fact.
    expect(
      deriveRadarrStatus(
        movie({
          hasFile: true,
          monitored: false,
          movieFile: { path: "/x.mkv", size: 1, quality: { quality: { name: "Bluray-1080p" } } },
        }),
      ),
    ).toBe("owned");
  });
});

describe("deriveSonarrStatus", () => {
  it("is owned when every episode has a file", () => {
    expect(
      deriveSonarrStatus(series({ statistics: { episodeFileCount: 10, episodeCount: 10, sizeOnDisk: 1 } })),
    ).toBe("owned");
  });

  it("is tracked_downloading when some but not all episodes have files", () => {
    expect(
      deriveSonarrStatus(series({ statistics: { episodeFileCount: 3, episodeCount: 10, sizeOnDisk: 1 } })),
    ).toBe("tracked_downloading");
  });

  it("is untracked when unmonitored with nothing downloaded", () => {
    expect(
      deriveSonarrStatus(
        series({ monitored: false, statistics: { episodeFileCount: 0, episodeCount: 10, sizeOnDisk: 0 } }),
      ),
    ).toBe("untracked");
  });

  it("is coming_soon for an upcoming series with nothing downloaded", () => {
    expect(
      deriveSonarrStatus(
        series({
          status: "upcoming",
          monitored: true,
          statistics: { episodeFileCount: 0, episodeCount: 0, sizeOnDisk: 0 },
        }),
      ),
    ).toBe("coming_soon");
  });

  it("is tracked_monitored for a monitored, airing series with nothing downloaded yet", () => {
    expect(
      deriveSonarrStatus(
        series({
          status: "continuing",
          monitored: true,
          statistics: { episodeFileCount: 0, episodeCount: 10, sizeOnDisk: 0 },
        }),
      ),
    ).toBe("tracked_monitored");
  });

  it("treats a series with zero total episodes as not owned, even with statistics present", () => {
    // episodeCount: 0 must not satisfy `episodeFileCount >= episodeCount`
    // (0 >= 0) and get misreported as "owned" for a show with no episodes yet.
    expect(
      deriveSonarrStatus(
        series({
          statistics: { episodeFileCount: 0, episodeCount: 0, sizeOnDisk: 0 },
          status: "continuing",
        }),
      ),
    ).not.toBe("owned");
  });
});
