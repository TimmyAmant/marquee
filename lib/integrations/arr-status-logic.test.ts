import { describe, it, expect } from "vitest";
import { deriveRadarrStatus, deriveSonarrStatus, isActiveQueueRecord, statusWithQueue, summarizeQueue } from "./arr-status-logic";
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

  it("is tracked_unmonitored when unmonitored with nothing downloaded", () => {
    expect(deriveRadarrStatus(movie({ monitored: false, hasFile: false }))).toBe("tracked_unmonitored");
    expect(deriveRadarrStatus(movie({ monitored: false, status: "announced" }))).toBe("tracked_unmonitored");
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

  it("is tracked_unmonitored when unmonitored with nothing downloaded", () => {
    expect(
      deriveSonarrStatus(
        series({ monitored: false, statistics: { episodeFileCount: 0, episodeCount: 10, sizeOnDisk: 0 } }),
      ),
    ).toBe("tracked_unmonitored");
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

  it("is owned when every episode has a file according to totalEpisodeCount", () => {
    // A finished 6-episode miniseries whose series-level episodeCount is 0.
    expect(
      deriveSonarrStatus(
        series({
          statistics: { episodeFileCount: 6, episodeCount: 0, totalEpisodeCount: 6, sizeOnDisk: 1 },
        }),
      ),
    ).toBe("owned");
  });

  it("is owned when all episodes across seasons are downloaded", () => {
    expect(
      deriveSonarrStatus(
        series({
          seasons: [
            {
              seasonNumber: 1,
              monitored: true,
              statistics: { episodeFileCount: 6, episodeCount: 6, totalEpisodeCount: 6 },
            },
          ],
        }),
      ),
    ).toBe("owned");
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

describe("isActiveQueueRecord", () => {
  it("doesn't count a download that's already imported (e.g. a torrent still seeding)", () => {
    expect(isActiveQueueRecord({ trackedDownloadState: "imported", sizeleft: 0 })).toBe(false);
  });

  it("doesn't count a finished download that was never imported", () => {
    // qBittorrent saving straight into its download folder: Radarr/Sonarr
    // leave it "downloading" with nothing left, for good.
    expect(isActiveQueueRecord({ trackedDownloadState: "downloading", sizeleft: 0 })).toBe(false);
    expect(isActiveQueueRecord({ trackedDownloadState: "importBlocked", sizeleft: 0 })).toBe(false);
  });

  it("counts a download with bytes left, including an upgrade of a title already on disk", () => {
    expect(isActiveQueueRecord({ trackedDownloadState: "downloading", sizeleft: 1024 })).toBe(true);
  });

  it("counts a download being imported right now", () => {
    expect(isActiveQueueRecord({ trackedDownloadState: "importPending", sizeleft: 0 })).toBe(true);
    expect(isActiveQueueRecord({ trackedDownloadState: "importing", sizeleft: 0 })).toBe(true);
  });

  it("counts a record that doesn't say how much is left, as before", () => {
    expect(isActiveQueueRecord({})).toBe(true);
  });
});

describe("summarizeQueue", () => {
  const record = (id: number, state: string, size: number, sizeleft: number) => ({ id, trackedDownloadState: state, size, sizeleft });

  it("adds up a title's downloads into one progress", () => {
    // A season pack's episodes: 300 of 1000 left.
    const summary = summarizeQueue(
      [record(1, "downloading", 600, 100), record(1, "downloading", 400, 200), record(2, "downloading", 10, 10)],
      (r) => r.id,
    );
    expect(summary.get(1)).toEqual({ active: true, progress: 70, finished: false });
    expect(summary.get(2)).toEqual({ active: true, progress: 0, finished: false });
  });

  it("says a finished download that wasn't imported is waiting, and an imported one isn't", () => {
    const summary = summarizeQueue(
      [record(1, "downloading", 500, 0), record(2, "imported", 500, 0), record(3, "importBlocked", 500, 0)],
      (r) => r.id,
    );
    expect(summary.get(1)).toEqual({ active: false, progress: null, finished: true });
    expect(summary.get(2)).toEqual({ active: false, progress: null, finished: false });
    expect(summary.get(3)).toEqual({ active: false, progress: null, finished: true });
  });

  it("keeps progress to the downloads still going when some episodes are done", () => {
    const summary = summarizeQueue([record(1, "downloading", 500, 0), record(1, "downloading", 500, 250)], (r) => r.id);
    expect(summary.get(1)).toEqual({ active: true, progress: 50, finished: true });
  });
});

describe("statusWithQueue", () => {
  const queue = (active: boolean, finished: boolean, progress: number | null = null) => ({ active, finished, progress });

  it("shows a download on its way, an upgrade of an owned title included", () => {
    expect(statusWithQueue("tracked_monitored", queue(true, false, 40))).toEqual({ status: "tracked_downloading", progress: 40 });
    expect(statusWithQueue("owned", queue(true, false, 10))).toEqual({ status: "tracked_downloading", progress: 10 });
  });

  it("is ready to move when a finished download isn't in the library yet", () => {
    expect(statusWithQueue("tracked_monitored", queue(false, true))).toEqual({ status: "ready_to_move", progress: null });
    // A show with some episodes already on disk.
    expect(statusWithQueue("tracked_downloading", queue(false, true))).toEqual({ status: "ready_to_move", progress: null });
  });

  it("goes by what's on disk otherwise", () => {
    expect(statusWithQueue("owned", queue(false, true))).toEqual({ status: "owned", progress: null });
    expect(statusWithQueue("tracked_monitored", undefined)).toEqual({ status: "tracked_monitored", progress: null });
  });
});
