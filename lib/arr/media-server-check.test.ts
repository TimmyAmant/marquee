import { beforeEach, describe, expect, it, vi } from "vitest";

// The media-server check: a show Plex has every episode of, which Sonarr
// still counts as incomplete (the files were moved in by hand and Sonarr
// hasn't looked in the folder since), gets one rescan, is read back, and
// turns Owned — and a difference that doesn't go away isn't rescanned every
// hour. Against a real Postgres (PGlite); Sonarr/Radarr are mocked out.

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", async () => (await import("@/lib/test/pglite")).testDatabase());
const sonarr = vi.hoisted(() => ({
  getQueueSummaries: vi.fn(async (..._args: unknown[]) => new Map()),
  getSeries: vi.fn(),
  rescanSeries: vi.fn(async (..._args: unknown[]) => undefined),
}));
vi.mock("@/lib/sonarr/client", () => sonarr);
const radarr = vi.hoisted(() => ({
  getQueueSummaries: vi.fn(async (..._args: unknown[]) => new Map()),
  getMovie: vi.fn(),
  rescanMovie: vi.fn(async (..._args: unknown[]) => undefined),
}));
vi.mock("@/lib/radarr/client", () => radarr);
const servers = vi.hoisted(() => ({
  sonarr: [] as { id: string; baseUrl: string; apiKey: string }[],
  radarr: [] as { id: string; baseUrl: string; apiKey: string }[],
  owners: [] as string[],
}));
vi.mock("@/lib/arr/servers", () => ({
  arrConfig: (s: { baseUrl: string; apiKey: string }) => ({ baseUrl: s.baseUrl, apiKey: s.apiKey }),
  listLibraryServers: async (_userId: string, kind: "sonarr" | "radarr") => servers[kind],
  ownersWithLibraryServers: async () => servers.owners,
}));
const complete = vi.hoisted(() => ({ scheduleCompletionCheck: vi.fn() }));
vi.mock("@/lib/requests/complete", () => complete);

import { eq } from "drizzle-orm";
import { resetTestDatabase, testDatabase } from "@/lib/test/pglite";
import { arrServers, arrStatusCache, jellyfinLibraryItems, jellyfinServers, plexLibraryItems, plexServers, titles, users } from "@/lib/db/schema";
import {
  RESCAN_MAX_GAP_MS,
  RESCAN_MIN_GAP_MS,
  backoffGap,
  checkArrAgainstMediaServers,
  mediaServerAhead,
  recordRescan,
  rescanAllowed,
} from "@/lib/arr/media-server-check";

const HOUR = 60 * 60 * 1000;

describe("mediaServerAhead", () => {
  const plex = (episodesHave: number | null) => ({ episodesHave, source: "Plex" });

  it("is ahead on a show when the media server has more regular episodes than Sonarr", () => {
    expect(mediaServerAhead("sonarr", { status: "tracked_downloading", episodesHave: 6 }, plex(10))).toBe(true);
    expect(mediaServerAhead("sonarr", { status: "tracked_monitored", episodesHave: 0 }, plex(10))).toBe(true);
  });

  it("isn't when Sonarr has as many or more, or either count is unknown", () => {
    expect(mediaServerAhead("sonarr", { status: "tracked_downloading", episodesHave: 10 }, plex(10))).toBe(false);
    expect(mediaServerAhead("sonarr", { status: "tracked_downloading", episodesHave: 12 }, plex(10))).toBe(false);
    expect(mediaServerAhead("sonarr", { status: "tracked_downloading", episodesHave: null }, plex(10))).toBe(false);
    expect(mediaServerAhead("sonarr", { status: "tracked_downloading", episodesHave: 3 }, plex(null))).toBe(false);
  });

  it("leaves alone what's owned, waiting to be moved (the download watch has it), or not on a media server", () => {
    expect(mediaServerAhead("sonarr", { status: "owned", episodesHave: 6 }, plex(10))).toBe(false);
    expect(mediaServerAhead("sonarr", { status: "ready_to_move", episodesHave: 6 }, plex(10))).toBe(false);
    expect(mediaServerAhead("sonarr", { status: "tracked_downloading", episodesHave: 6 }, undefined)).toBe(false);
    expect(mediaServerAhead("radarr", { status: "tracked_monitored", episodesHave: null }, undefined)).toBe(false);
  });

  it("is ahead on any movie the media server has and Radarr hasn't a file for", () => {
    expect(mediaServerAhead("radarr", { status: "tracked_monitored", episodesHave: null }, plex(null))).toBe(true);
    expect(mediaServerAhead("radarr", { status: "owned", episodesHave: null }, plex(null))).toBe(false);
  });
});

describe("rescan rate limiting", () => {
  it("rescans at most every 45 minutes, backing off to once a day while nothing changes", () => {
    expect(rescanAllowed(0, undefined, 10)).toBe(true);
    let record = recordRescan(0, undefined, 10);
    expect(rescanAllowed(30 * 60 * 1000, record, 10)).toBe(false);
    expect(rescanAllowed(RESCAN_MIN_GAP_MS, record, 10)).toBe(true);

    // The hourly check, with the same difference every time.
    const rescannedAt: number[] = [0];
    for (let hour = 1; hour <= 72; hour++) {
      if (rescanAllowed(hour * HOUR, record, 10)) {
        record = recordRescan(hour * HOUR, record, 10);
        rescannedAt.push(hour);
      }
    }
    expect(rescannedAt.slice(0, 6)).toEqual([0, 1, 3, 6, 12, 24]);
    expect(rescannedAt.length).toBeLessThanOrEqual(8); // three days, not 72 rescans
    expect(backoffGap(50)).toBe(RESCAN_MAX_GAP_MS);
  });

  it("starts over when the media server has something new, but never within the minimum gap", () => {
    const record = { at: 0, attempts: 5, mediaHave: 10 };
    expect(rescanAllowed(HOUR, record, 10)).toBe(false);
    expect(rescanAllowed(HOUR, record, 11)).toBe(true);
    expect(rescanAllowed(10 * 60 * 1000, record, 11)).toBe(false);
    expect(recordRescan(HOUR, record, 11)).toEqual({ at: HOUR, attempts: 1, mediaHave: 11 });
    expect(recordRescan(HOUR, record, 10)).toEqual({ at: HOUR, attempts: 6, mediaHave: 10 });
  });
});

describe("checkArrAgainstMediaServers", () => {
  let admin: string;
  let tmdbId = 5000;
  let clock = 1_000_000_000_000;

  const series = (have: number) => ({
    id: 42,
    tvdbId: 1,
    title: "Slow Horses",
    monitored: true,
    status: "continuing",
    statistics: { episodeCount: 10, episodeFileCount: have, totalEpisodeCount: 12, sizeOnDisk: have * 1000 },
    seasons: [
      { seasonNumber: 0, monitored: false, statistics: { episodeFileCount: 0, episodeCount: 0, totalEpisodeCount: 2 } },
      { seasonNumber: 1, monitored: true, statistics: { episodeFileCount: have, episodeCount: 10, totalEpisodeCount: 10 } },
    ],
  });

  async function row() {
    const { db } = await testDatabase();
    const [r] = await db.select().from(arrStatusCache).where(eq(arrStatusCache.externalId, tmdbId));
    return r;
  }

  beforeEach(async () => {
    await resetTestDatabase();
    vi.clearAllMocks();
    tmdbId++; // the check remembers titles between runs; each test gets its own
    clock += 10 * 24 * HOUR;
    const { db } = await testDatabase();
    const [a] = await db.insert(users).values({ username: "admin", role: "admin", permissions: [] }).returning();
    admin = a.id;
    const [server] = await db
      .insert(arrServers)
      .values({
        userId: admin,
        kind: "sonarr",
        name: "Sonarr",
        baseUrl: "http://sonarr",
        apiKeyEnc: Buffer.from("x"),
        apiKeyIv: Buffer.from("x"),
        apiKeyTag: Buffer.from("x"),
        isDefault: true,
        webhookSecret: "s",
      })
      .returning();
    servers.sonarr = [{ id: server.id, baseUrl: "http://sonarr", apiKey: "k" }];
    servers.radarr = [];
    servers.owners = [admin];
    await db.insert(titles).values({ mediaType: "tv", tmdbId, name: "Slow Horses" });
    await db.insert(arrStatusCache).values({
      userId: admin,
      provider: "sonarr",
      externalId: tmdbId,
      arrId: 42,
      serverId: server.id,
      status: "tracked_downloading",
      monitored: true,
      episodesHave: 6,
      episodesAired: 10,
    });
  });

  async function plexHas(episodesHave: number) {
    const { db } = await testDatabase();
    const [plex] = await db.insert(plexServers).values({ userId: admin, machineIdentifier: "m" }).returning();
    await db.insert(plexLibraryItems).values({
      plexServerId: plex.id,
      ratingKey: "1",
      mediaType: "tv",
      tmdbId,
      title: "Slow Horses",
      episodeCount: episodesHave + 2,
      episodesHave,
    });
  }

  it("has Sonarr rescan a show Plex has in full, reads it back, and checks the requests", async () => {
    await plexHas(10);
    sonarr.getSeries.mockResolvedValue(series(10));
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    await checkArrAgainstMediaServers({ followUpMs: 0, now: clock });

    expect(sonarr.rescanSeries).toHaveBeenCalledTimes(1);
    expect(sonarr.rescanSeries).toHaveBeenCalledWith({ baseUrl: "http://sonarr", apiKey: "k" }, 42);
    expect(info.mock.calls.flat().join("\n")).toContain('Plex has 10 episodes of "Slow Horses" but Sonarr has 6');
    expect(await row()).toMatchObject({ status: "owned", episodesHave: 10 });
    expect(complete.scheduleCompletionCheck).toHaveBeenCalledWith({ mediaType: "tv", tmdbId, is4k: false });
    info.mockRestore();
  });

  it("doesn't rescan again an hour later when nothing changed, but does once Plex has more", async () => {
    await plexHas(8);
    sonarr.getSeries.mockResolvedValue(series(6)); // Sonarr never finds them (numbered differently, say)
    vi.spyOn(console, "info").mockImplementation(() => undefined);

    await checkArrAgainstMediaServers({ followUpMs: 0, now: clock });
    await checkArrAgainstMediaServers({ followUpMs: 0, now: clock + 10 * 60 * 1000 });
    expect(sonarr.rescanSeries).toHaveBeenCalledTimes(1);
    await checkArrAgainstMediaServers({ followUpMs: 0, now: clock + HOUR });
    expect(sonarr.rescanSeries).toHaveBeenCalledTimes(2);
    await checkArrAgainstMediaServers({ followUpMs: 0, now: clock + 2 * HOUR });
    expect(sonarr.rescanSeries).toHaveBeenCalledTimes(2); // backing off

    const { db } = await testDatabase();
    await db.update(plexLibraryItems).set({ episodesHave: 9 }).where(eq(plexLibraryItems.tmdbId, tmdbId));
    await checkArrAgainstMediaServers({ followUpMs: 0, now: clock + 2 * HOUR });
    expect(sonarr.rescanSeries).toHaveBeenCalledTimes(3);
    expect(await row()).toMatchObject({ status: "tracked_downloading" });
    vi.mocked(console.info).mockRestore();
  });

  it("leaves a show alone when Plex has no more than Sonarr, and counts Jellyfin too", async () => {
    await plexHas(6);
    await checkArrAgainstMediaServers({ followUpMs: 0, now: clock });
    expect(sonarr.rescanSeries).not.toHaveBeenCalled();

    const { db } = await testDatabase();
    const [jf] = await db.insert(jellyfinServers).values({ userId: admin, serverId: "j" }).returning();
    await db
      .insert(jellyfinLibraryItems)
      .values({ jellyfinServerId: jf.id, itemId: "s1", mediaType: "tv", tmdbId, episodesHave: 10 });
    sonarr.getSeries.mockResolvedValue(series(10));
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    await checkArrAgainstMediaServers({ followUpMs: 0, now: clock });
    expect(sonarr.rescanSeries).toHaveBeenCalledTimes(1);
    expect(vi.mocked(console.info).mock.calls.flat().join("\n")).toContain("Jellyfin has 10 episodes");
    vi.mocked(console.info).mockRestore();
  });

  it("doesn't count another user's media server", async () => {
    const { db } = await testDatabase();
    const [other] = await db.insert(users).values({ username: "other", role: "member", permissions: [] }).returning();
    const [plex] = await db.insert(plexServers).values({ userId: other.id, machineIdentifier: "o" }).returning();
    await db
      .insert(plexLibraryItems)
      .values({ plexServerId: plex.id, ratingKey: "1", mediaType: "tv", tmdbId, episodesHave: 10 });
    await checkArrAgainstMediaServers({ followUpMs: 0, now: clock });
    expect(sonarr.rescanSeries).not.toHaveBeenCalled();
  });

  it("has Radarr rescan a movie Plex has", async () => {
    const { db } = await testDatabase();
    const [server] = await db
      .insert(arrServers)
      .values({
        userId: admin,
        kind: "radarr",
        name: "Radarr",
        baseUrl: "http://radarr",
        apiKeyEnc: Buffer.from("x"),
        apiKeyIv: Buffer.from("x"),
        apiKeyTag: Buffer.from("x"),
        isDefault: true,
        webhookSecret: "r",
      })
      .returning();
    servers.radarr = [{ id: server.id, baseUrl: "http://radarr", apiKey: "k" }];
    await db.insert(arrStatusCache).values({
      userId: admin,
      provider: "radarr",
      externalId: tmdbId,
      arrId: 7,
      serverId: server.id,
      status: "tracked_monitored",
      monitored: true,
    });
    const [plex] = await db.insert(plexServers).values({ userId: admin, machineIdentifier: "m" }).returning();
    await db.insert(plexLibraryItems).values({ plexServerId: plex.id, ratingKey: "9", mediaType: "movie", tmdbId });
    radarr.getMovie.mockResolvedValue({
      id: 7,
      tmdbId,
      title: "Heat",
      monitored: true,
      status: "released",
      hasFile: true,
      movieFile: { size: 5, path: "/movies/Heat/heat.mkv" },
    });
    vi.spyOn(console, "info").mockImplementation(() => undefined);

    await checkArrAgainstMediaServers({ followUpMs: 0, now: clock });

    expect(radarr.rescanMovie).toHaveBeenCalledWith({ baseUrl: "http://radarr", apiKey: "k" }, 7);
    expect(sonarr.rescanSeries).not.toHaveBeenCalled(); // Plex's movie isn't the show with the same number
    const [movieRow] = await db.select().from(arrStatusCache).where(eq(arrStatusCache.provider, "radarr"));
    expect(movieRow).toMatchObject({ status: "owned" });
    expect(complete.scheduleCompletionCheck).toHaveBeenCalledWith({ mediaType: "movie", tmdbId, is4k: false });
    vi.mocked(console.info).mockRestore();
  });
});
