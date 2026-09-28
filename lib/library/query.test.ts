import { beforeEach, describe, expect, it, vi } from "vitest";

// The library merge on a real Postgres (PGlite): what getUserLibrary reads
// from the four sources, the new columns (genres, rating, codec, episode
// files, the arr id), the header counts, the duplicates query, and the
// filters/sort/paging end to end over it.

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", async () => (await import("@/lib/test/pglite")).testDatabase());

import { resetTestDatabase, testDatabase } from "@/lib/test/pglite";
import { GB, seedLibrary } from "@/lib/test/library-seed";
import { getEpisodeCountMap, getUserLibrary, summarizeLibrary } from "@/lib/library/query";
import { jellyfinLibraryItems, jellyfinServers, plexLibraryItems, plexServers, titles, users } from "@/lib/db/schema";
import { getLibraryDuplicates } from "@/lib/library/duplicates";
import { DEFAULT_PAGE_SIZE, queryLibrary } from "@/lib/library/list";
import { forecastDiskSpace } from "@/lib/integrations/disk-space-logic";
import { getDiskSpaceForecast } from "@/lib/integrations/disk-space";

let adminId: string;
beforeEach(async () => {
  await resetTestDatabase();
  ({ adminId } = await seedLibrary());
});

describe("getUserLibrary", () => {
  it("merges every source into one row per title", async () => {
    const library = await getUserLibrary(adminId);
    const byId = new Map(library.map((i) => [i.tmdbId, i]));
    expect([...byId.keys()].sort()).toEqual([1399, 27205, 603, 949, 95396].sort());

    // Plex and Jellyfin both have The Matrix; the last media server merged wins the row, the arr's id and flag ride along.
    const matrix = byId.get(603)!;
    expect(matrix).toMatchObject({ status: "owned", source: "jellyfin", arrId: 12, monitored: true, qualityName: "Bluray-2160p", possibleDuplicate: true });
    expect(matrix.genres).toEqual(["Action", "Science Fiction"]);
    expect(matrix.rating).toBe(8.2);
    expect(matrix.videoCodec).toBe("H264");

    // Sonarr's episode-file count is the more exact of the two.
    expect(byId.get(1399)).toMatchObject({ source: "plex", episodeCount: 61, arrId: 7, videoCodec: "H264" });
    // A media-server-only title has no arr handle; an arr-only one no addedAt or codec.
    expect(byId.get(949)).toMatchObject({ source: "jellyfin", arrId: null, monitored: null, dynamicRange: "HDR10" });
    expect(byId.get(27205)).toMatchObject({ source: "radarr", status: "tracked_monitored", addedAt: null, videoCodec: null, rating: 8.4 });
    expect(byId.get(95396)).toMatchObject({ source: "sonarr", status: "tracked_downloading", episodeCount: 3 });
  });

  it("counts movies, series, episode files and bytes on disk", () => {
    return getUserLibrary(adminId).then((library) => {
      expect(summarizeLibrary(library)).toEqual({
        movieCount: 2,
        tvCount: 1,
        episodeCount: 64,
        totalBytes: 8 * GB + 12 * GB + 90 * GB,
        trackedCount: 2,
      });
    });
  });

  it("filters, sorts and pages what it read", async () => {
    const library = await getUserLibrary(adminId);
    const base = { sort: "recent" as const, page: 1, pageSize: DEFAULT_PAGE_SIZE };
    expect(queryLibrary(library, base).results.map((i) => i.tmdbId)).toEqual([949, 1399, 603, 95396, 27205]);
    expect(queryLibrary(library, { ...base, genre: "action" }).results.map((i) => i.tmdbId)).toEqual([603, 27205]);
    expect(queryLibrary(library, { ...base, hdr: true, sort: "title" }).results.map((i) => i.name)).toEqual(["Heat", "The Matrix"]);
    expect(queryLibrary(library, { ...base, status: "tracked_downloading" }).results.map((i) => i.tmdbId)).toEqual([95396]);
    expect(queryLibrary(library, { ...base, codec: "hevc" }).results.map((i) => i.tmdbId)).toEqual([949]);
    const page = queryLibrary(library, { ...base, sort: "size", page: 2, pageSize: 2 });
    expect(page).toMatchObject({ page: 2, totalPages: 3, totalResults: 5 });
    expect(page.results.map((i) => i.tmdbId)).toEqual([603, 95396]);
  });

  it("is empty for someone with no servers", async () => {
    expect(await getUserLibrary("00000000-0000-4000-8000-000000000000")).toEqual([]);
  });
});

describe("getLibraryDuplicates", () => {
  it("lists the title in two files across Plex, Jellyfin and Radarr, with each server named", async () => {
    const groups = await getLibraryDuplicates(adminId);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ mediaType: "movie", tmdbId: 603, name: "The Matrix", year: "1999", reason: "paths" });
    expect(groups[0].copies.map((c) => [c.source, c.server]).sort()).toEqual([
      ["jellyfin", "Attic"],
      ["plex", "Tower"],
      ["radarr", "Radarr"],
    ]);
    expect(groups[0].copies.find((c) => c.source === "radarr")).toMatchObject({ quality: "Bluray-2160p", sizeBytes: 30 * GB });
  });
});

describe("getDiskSpaceForecast", () => {
  it("reads the month's snapshots", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-20T12:00:00Z"));
    try {
      const forecast = await getDiskSpaceForecast(adminId);
      expect(forecast).toEqual(forecastDiskSpace([
        { path: "/movies", freeBytes: 1000 * GB, capturedAt: new Date("2026-09-01T03:00:00Z") },
        { path: "/movies", freeBytes: 900 * GB, capturedAt: new Date("2026-09-11T03:00:00Z") },
        { path: "/tv", freeBytes: 500 * GB, capturedAt: new Date("2026-09-11T03:00:00Z") },
      ]));
      expect(forecast).toMatchObject({ daysRemaining: 90, bytesPerDay: 10 * GB });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("getEpisodeCountMap", () => {
  it("reads Sonarr's counts, else a media server's files against TMDb's aired episodes, for series only", async () => {
    const { db } = await testDatabase();
    const [plex] = await db.select({ id: plexServers.id }).from(plexServers);
    const [jellyfin] = await db.select({ id: jellyfinServers.id }).from(jellyfinServers);
    const aired = (seasons: number[], last: [number, number]) => ({
      seasons: [{ season_number: 0, episode_count: 5 }, ...seasons.map((count, i) => ({ season_number: i + 1, episode_count: count }))],
      last_episode_to_air: { season_number: last[0], episode_number: last[1] },
    });
    await db.insert(titles).values([
      { mediaType: "tv", tmdbId: 1407, name: "Homeland", rawTmdb: aired([12, 12, 12, 12, 12, 12, 12, 12], [8, 12]) },
      { mediaType: "tv", tmdbId: 66732, name: "Stranger Things", rawTmdb: aired([8, 9, 8, 9], [4, 9]) },
      { mediaType: "tv", tmdbId: 1100, name: "Old Show", rawTmdb: aired([10], [1, 10]) },
    ]);
    await db.insert(plexLibraryItems).values([
      { plexServerId: plex.id, ratingKey: "hl", mediaType: "tv", tmdbId: 1407, title: "Homeland", episodeCount: 99, episodesHave: 96 },
      { plexServerId: plex.id, ratingKey: "st", mediaType: "tv", tmdbId: 66732, title: "Stranger Things", episodesHave: 20 },
      // A Plex row from a sync older than the column: no count.
      { plexServerId: plex.id, ratingKey: "old", mediaType: "tv", tmdbId: 1100, title: "Old Show", episodeCount: 10 },
    ]);
    // The same show on Jellyfin with more of it: the most any server has.
    await db.insert(jellyfinLibraryItems).values([
      { jellyfinServerId: jellyfin.id, itemId: "st", mediaType: "tv", tmdbId: 66732, title: "Stranger Things", episodesHave: 30 },
    ]);

    const counts = await getEpisodeCountMap(adminId, [
      // Game of Thrones is on Plex too, but Sonarr's count wins.
      { mediaType: "tv", tmdbId: 1399 },
      { mediaType: "tv", tmdbId: 95396 },
      { mediaType: "tv", tmdbId: 1407 },
      { mediaType: "tv", tmdbId: 66732 },
      { mediaType: "tv", tmdbId: 1100 },
      // Not in the library.
      { mediaType: "tv", tmdbId: 4242 },
      { mediaType: "movie", tmdbId: 603 },
    ]);
    expect(Object.fromEntries(counts)).toEqual({
      "tv:1399": { have: 73, total: 73 },
      "tv:95396": { have: 3, total: 19 },
      "tv:1407": { have: 96, total: 96 },
      "tv:66732": { have: 30, total: 34 },
    });
  });

  it("is empty without a series asked about, and for someone with no library", async () => {
    expect((await getEpisodeCountMap(adminId, [{ mediaType: "movie", tmdbId: 603 }])).size).toBe(0);
    const { db } = await testDatabase();
    const [stranger] = await db.insert(users).values({ username: "stranger", role: "member", permissions: [] }).returning({ id: users.id });
    expect((await getEpisodeCountMap(stranger.id, [{ mediaType: "tv", tmdbId: 1399 }])).size).toBe(0);
  });
});
