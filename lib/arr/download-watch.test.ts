import { beforeEach, describe, expect, it, vi } from "vitest";

// The minute-by-minute download watch against a real Postgres (PGlite):
// progress while a movie downloads, "Ready to move" (and one notice to the
// library owner) once it's finished but not imported, a rescan of its
// folder while it waits, and Owned — with the requesters' check — once the
// file's been moved in. Radarr and the notification channels are mocked out.

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", async () => (await import("@/lib/test/pglite")).testDatabase());
const radarr = vi.hoisted(() => ({
  getQueueSummaries: vi.fn(),
  getMovie: vi.fn(),
  rescanMovie: vi.fn(async (..._args: unknown[]) => undefined),
}));
vi.mock("@/lib/radarr/client", () => radarr);
vi.mock("@/lib/sonarr/client", () => ({ getQueueSummaries: vi.fn(), getSeries: vi.fn(), rescanSeries: vi.fn() }));
const servers = vi.hoisted(() => ({ list: [] as { id: string; baseUrl: string; apiKey: string }[], owners: [] as string[] }));
vi.mock("@/lib/arr/servers", () => ({
  arrConfig: (s: { baseUrl: string; apiKey: string }) => ({ baseUrl: s.baseUrl, apiKey: s.apiKey }),
  listLibraryServers: async (_userId: string, kind: string) => (kind === "radarr" ? servers.list : []),
  ownersWithLibraryServers: async (kind: string) => (kind === "radarr" ? servers.owners : []),
}));
const complete = vi.hoisted(() => ({ scheduleCompletionCheck: vi.fn() }));
vi.mock("@/lib/requests/complete", () => complete);
vi.mock("@/lib/notifications/fan-out", () => ({ fanOut: vi.fn(async () => undefined) }));
vi.mock("@/lib/notifications/bus", () => ({ publishNotification: () => undefined }));
vi.mock("@/lib/push/deliver", () => ({ pushToUser: async () => 0, pushMessageFor: () => ({}) }));

import { eq } from "drizzle-orm";
import { resetTestDatabase, testDatabase } from "@/lib/test/pglite";
import { arrServers, arrStatusCache, notifications, titles, users } from "@/lib/db/schema";
import { rescanDue, watchDownloads } from "@/lib/arr/download-watch";

let admin: string;
let tmdbId = 1000;

const movie = (hasFile: boolean) => ({
  id: tmdbId,
  tmdbId,
  title: "Wedding Crashers",
  monitored: true,
  status: "released",
  hasFile,
  movieFile: hasFile ? { size: 2_000, path: "/movies/Wedding Crashers/wc.mkv" } : undefined,
});

async function row() {
  const { db } = await testDatabase();
  const [r] = await db.select().from(arrStatusCache).where(eq(arrStatusCache.externalId, tmdbId));
  return r;
}

beforeEach(async () => {
  await resetTestDatabase();
  vi.clearAllMocks();
  tmdbId++; // the watch remembers titles between runs; each test gets its own
  const { db } = await testDatabase();
  const [a] = await db.insert(users).values({ username: "admin", role: "admin", permissions: [] }).returning();
  admin = a.id;
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
      webhookSecret: "s",
    })
    .returning();
  servers.list = [{ id: server.id, baseUrl: "http://radarr", apiKey: "k" }];
  servers.owners = [admin];
  await db.insert(titles).values({ mediaType: "movie", tmdbId, name: "Wedding Crashers" });
  await db.insert(arrStatusCache).values({
    userId: admin,
    provider: "radarr",
    externalId: tmdbId,
    arrId: tmdbId,
    serverId: server.id,
    status: "tracked_monitored",
    monitored: true,
  });
});

describe("the download watch", () => {
  it("shows a download's progress", async () => {
    radarr.getQueueSummaries.mockResolvedValue(new Map([[tmdbId, { active: true, progress: 63, finished: false }]]));
    await watchDownloads();
    expect(await row()).toMatchObject({ status: "tracked_downloading", downloadProgress: 63 });
    expect(radarr.getMovie).not.toHaveBeenCalled();
  });

  it("marks a finished download that wasn't imported ready to move, tells the owner once, and rescans its folder", async () => {
    radarr.getQueueSummaries.mockResolvedValue(new Map([[tmdbId, { active: false, progress: null, finished: true }]]));
    radarr.getMovie.mockResolvedValue(movie(false));

    await watchDownloads();
    expect(await row()).toMatchObject({ status: "ready_to_move", downloadProgress: null });
    expect(radarr.rescanMovie).toHaveBeenCalledWith({ baseUrl: "http://radarr", apiKey: "k" }, tmdbId);

    await watchDownloads(); // a minute later: no second notice, no second rescan yet
    const { db } = await testDatabase();
    const told = await db.select().from(notifications).where(eq(notifications.userId, admin));
    expect(told).toMatchObject([
      {
        eventType: "download_ready",
        message: "Wedding Crashers finished downloading and is ready to move into your library.",
      },
    ]);
    expect(radarr.rescanMovie).toHaveBeenCalledTimes(1);
    expect(complete.scheduleCompletionCheck).not.toHaveBeenCalled();
  });

  it("turns owned once the file's been moved in, and checks the requests", async () => {
    radarr.getQueueSummaries.mockResolvedValue(new Map([[tmdbId, { active: false, progress: null, finished: true }]]));
    radarr.getMovie.mockResolvedValue(movie(false));
    await watchDownloads();

    radarr.getMovie.mockResolvedValue(movie(true));
    await watchDownloads();

    expect(await row()).toMatchObject({ status: "owned", sizeBytes: 2_000 });
    expect(complete.scheduleCompletionCheck).toHaveBeenCalledWith({ mediaType: "movie", tmdbId, is4k: false });
  });

  it("looks at a download that left the queue (imported the usual way) once more", async () => {
    radarr.getQueueSummaries.mockResolvedValue(new Map([[tmdbId, { active: true, progress: 99, finished: false }]]));
    await watchDownloads();
    radarr.getQueueSummaries.mockResolvedValue(new Map());
    radarr.getMovie.mockResolvedValue(movie(true));
    await watchDownloads();
    expect(await row()).toMatchObject({ status: "owned", downloadProgress: null });
    expect(radarr.rescanMovie).not.toHaveBeenCalled();
  });

  it("leaves a title alone when Radarr doesn't answer", async () => {
    radarr.getQueueSummaries.mockRejectedValue(new Error("down"));
    await watchDownloads();
    expect(await row()).toMatchObject({ status: "tracked_monitored" });
  });
});

describe("rescanDue", () => {
  const minute = 60_000;
  it("rescans every couple of minutes, then every 15 once it's been waiting an hour", () => {
    expect(rescanDue(0, 0, undefined)).toBe(true);
    expect(rescanDue(minute, 0, 0)).toBe(false);
    expect(rescanDue(2 * minute, 0, 0)).toBe(true);
    expect(rescanDue(62 * minute, 0, 60 * minute)).toBe(false);
    expect(rescanDue(75 * minute, 0, 60 * minute)).toBe(true);
  });
});
