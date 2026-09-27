import { beforeEach, describe, expect, it, vi } from "vitest";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";

// "Ready to watch" against a real Postgres (PGlite, lib/test/pglite.ts):
// who's told, that it's once per request however many checks race for it,
// that the household channels hear it once, and that requests from before
// the notices existed aren't announced. Sonarr, Radarr, Plex, Jellyfin and
// the notification channels are mocked out.

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", async () => (await import("@/lib/test/pglite")).testDatabase());
const effects = vi.hoisted(() => ({ fanOut: vi.fn(async (_input: unknown, _relay: boolean) => undefined) }));
vi.mock("@/lib/notifications/fan-out", () => ({ fanOut: effects.fanOut }));
vi.mock("@/lib/notifications/bus", () => ({ publishNotification: () => undefined }));
vi.mock("@/lib/push/deliver", () => ({ pushToUser: async () => 0, pushMessageFor: () => ({}) }));
vi.mock("@/lib/tmdb/cache", () => ({ getOrFetchTitle: async () => ({ tvdbId: 371980 }) }));

type Server = { id: string; kind: "radarr" | "sonarr"; fourK: boolean };
const library = vi.hoisted(() => ({
  servers: [] as Server[],
  /** Which servers have the movie's file. */
  movieFiles: new Set<string>(),
  /** Each server's episodes of the show (absent: it doesn't have it). */
  episodes: new Map<string, { seasonNumber: number; hasFile: boolean; monitored: boolean; airDateUtc: string | null }[]>(),
  plexOwns: false,
  failing: new Set<string>(),
}));
vi.mock("@/lib/arr/servers", () => ({
  arrConfig: (server: Server) => server,
  listArrServers: async (_owner: string, filter: { kind: string; fourK: boolean }) =>
    library.servers.filter((s) => s.kind === filter.kind && s.fourK === filter.fourK),
  listLibraryServers: async (_owner: string, kind: string) => library.servers.filter((s) => s.kind === kind && !s.fourK),
}));
vi.mock("@/lib/radarr/client", () => ({
  getMovieByTmdbId: vi.fn(async (server: Server) => {
    if (library.failing.has(server.id)) throw new Error("unreachable");
    return { id: 1, hasFile: library.movieFiles.has(server.id) };
  }),
}));
vi.mock("@/lib/sonarr/client", () => ({
  getSeriesByTvdbId: vi.fn(async (server: Server) => {
    if (library.failing.has(server.id)) throw new Error("unreachable");
    return library.episodes.has(server.id) ? { id: 7 } : null;
  }),
  getAllEpisodes: vi.fn(async (server: Server) => library.episodes.get(server.id) ?? []),
}));
vi.mock("@/lib/plex/sync", () => ({ getPlexFileInfo: async () => (library.plexOwns ? { path: "/m" } : null) }));
vi.mock("@/lib/jellyfin/sync", () => ({ getJellyfinFileInfo: async () => null }));

import { resetTestDatabase, testDatabase } from "@/lib/test/pglite";
import { notifications, requests, users } from "@/lib/db/schema";
import { presetPermissions } from "@/lib/users/permissions";
import { checkCompletedRequests } from "@/lib/requests/complete";

async function db() {
  return (await testDatabase()).db;
}

let admin: string;
let anna: string;
let ben: string;

async function addUser(username: string, role: "admin" | "member") {
  const [row] = await (await db())
    .insert(users)
    .values({ username, role, permissions: presetPermissions("member") })
    .returning({ id: users.id });
  return row.id;
}

async function request(userId: string, input: Partial<typeof requests.$inferInsert> = {}) {
  const [row] = await (await db())
    .insert(requests)
    .values({ requestedByUserId: userId, mediaType: "movie", tmdbId: 438631, title: "Dune", status: "approved", ...input })
    .returning();
  return row;
}

async function requestRow(id: string) {
  const [row] = await (await db()).select().from(requests).where(eq(requests.id, id));
  return row;
}

async function noticesFor(userId: string) {
  return (await db()).select().from(notifications).where(eq(notifications.userId, userId));
}

const past = "2026-01-01T02:00:00Z";
const future = "2099-01-01T02:00:00Z";
const episode = (seasonNumber: number, hasFile: boolean, airDateUtc: string | null = past) => ({
  seasonNumber,
  hasFile,
  monitored: true,
  airDateUtc,
});

beforeEach(async () => {
  await resetTestDatabase();
  vi.clearAllMocks();
  library.servers = [
    { id: "radarr", kind: "radarr", fourK: false },
    { id: "radarr4k", kind: "radarr", fourK: true },
    { id: "sonarr", kind: "sonarr", fourK: false },
  ];
  library.movieFiles = new Set();
  library.episodes = new Map();
  library.plexOwns = false;
  library.failing = new Set();
  admin = await addUser("admin", "admin");
  anna = await addUser("anna", "member");
  ben = await addUser("ben", "member");
});

describe("a movie", () => {
  it("tells the requester once it's in, and never again", async () => {
    const mine = await request(anna);
    await checkCompletedRequests();
    expect(await noticesFor(anna)).toEqual([]);
    expect((await requestRow(mine.id)).notifiedCompleteAt).toBeNull();

    library.movieFiles.add("radarr");
    await checkCompletedRequests();
    const notices = await noticesFor(anna);
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ eventType: "downloaded", message: "Dune, which you requested, is ready to watch" });
    expect((await requestRow(mine.id)).notifiedCompleteAt).not.toBeNull();

    await checkCompletedRequests();
    await checkCompletedRequests({ mediaType: "movie", tmdbId: 438631, is4k: false });
    expect(await noticesFor(anna)).toHaveLength(1);
  });

  it("counts a copy in Plex", async () => {
    await request(anna);
    library.plexOwns = true;
    await checkCompletedRequests();
    expect(await noticesFor(anna)).toHaveLength(1);
  });

  it("tells every requester but not the admin, and posts to the household channels once", async () => {
    await request(anna);
    await request(ben, { status: "pending" });
    library.movieFiles.add("radarr");
    await checkCompletedRequests();

    expect(await noticesFor(anna)).toHaveLength(1);
    expect(await noticesFor(ben)).toHaveLength(1);
    expect(await noticesFor(admin)).toEqual([]);
    const relays = effects.fanOut.mock.calls.map(([, relay]) => relay);
    expect(relays.sort()).toEqual([false, true]);
    // The household copy doesn't say "which you requested".
    const relayed = effects.fanOut.mock.calls.find(([, relay]) => relay)![0] as { householdMessage?: string };
    expect(relayed.householdMessage).toBe("Dune is ready to watch");
  });

  it("tells the admin when the admin asked for it", async () => {
    await request(admin);
    library.movieFiles.add("radarr");
    await checkCompletedRequests();
    expect(await noticesFor(admin)).toHaveLength(1);
  });

  it("leaves declined requests alone", async () => {
    await request(anna, { status: "rejected" });
    library.movieFiles.add("radarr");
    await checkCompletedRequests();
    expect(await noticesFor(anna)).toEqual([]);
  });

  it("judges a 4K request by the 4K server alone", async () => {
    const regular = await request(anna);
    const fourK = await request(ben, { is4k: true });
    library.movieFiles.add("radarr");
    library.plexOwns = true;
    await checkCompletedRequests();
    expect((await requestRow(regular.id)).notifiedCompleteAt).not.toBeNull();
    expect((await requestRow(fourK.id)).notifiedCompleteAt).toBeNull();

    library.movieFiles.add("radarr4k");
    await checkCompletedRequests({ mediaType: "movie", tmdbId: 438631, is4k: true });
    const notices = await noticesFor(ben);
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ is4k: true, message: "Dune in 4K, which you requested, is ready to watch" });
  });

  it("says nothing, and decides nothing, while the server can't be reached", async () => {
    const old = await request(anna, { completeNoticeArmed: false });
    library.failing.add("radarr");
    await checkCompletedRequests();
    expect(await requestRow(old.id)).toMatchObject({ notifiedCompleteAt: null, completeNoticeArmed: false });
  });

  it("is told once however many checks race for it", async () => {
    await request(anna);
    await request(ben);
    library.movieFiles.add("radarr");
    const scope = { mediaType: "movie" as const, tmdbId: 438631, is4k: false };
    await Promise.all([
      checkCompletedRequests(scope),
      checkCompletedRequests(scope),
      checkCompletedRequests(),
      checkCompletedRequests(scope),
    ]);
    expect(await noticesFor(anna)).toHaveLength(1);
    expect(await noticesFor(ben)).toHaveLength(1);
    expect(effects.fanOut.mock.calls.filter(([, relay]) => relay)).toHaveLength(1);
  });
});

describe("a show", () => {
  const show = { mediaType: "tv" as const, tmdbId: 95396, title: "Severance" };

  it("waits for every aired episode, not the ones still to air", async () => {
    await request(anna, show);
    library.episodes.set("sonarr", [episode(1, true), episode(1, false), episode(2, false, future)]);
    await checkCompletedRequests();
    expect(await noticesFor(anna)).toEqual([]);

    library.episodes.set("sonarr", [episode(1, true), episode(1, true), episode(2, false, future)]);
    await checkCompletedRequests();
    const notices = await noticesFor(anna);
    expect(notices).toHaveLength(1);
    expect(notices[0].message).toBe("Severance, which you requested: all aired episodes are ready to watch");
  });

  it("judges a season request by its own seasons, specials only when asked for", async () => {
    const season2 = await request(anna, { ...show, seasons: [2] });
    const withSpecials = await request(ben, { ...show, seasons: [0, 2] });
    library.episodes.set("sonarr", [episode(0, false), episode(1, false), episode(2, true), episode(2, true)]);
    await checkCompletedRequests();
    expect((await requestRow(season2.id)).notifiedCompleteAt).not.toBeNull();
    expect((await requestRow(withSpecials.id)).notifiedCompleteAt).toBeNull();
    expect((await noticesFor(anna))[0].message).toBe("Severance (Season 2), which you requested: all aired episodes are ready to watch");
  });

  it("tells someone with two finished requests for it once", async () => {
    await request(anna, { ...show, seasons: [1] });
    await request(anna, { ...show, seasons: [2], status: "pending" });
    library.episodes.set("sonarr", [episode(1, true), episode(2, true)]);
    await checkCompletedRequests();
    const notices = await noticesFor(anna);
    expect(notices).toHaveLength(1);
    expect(notices[0].message).toBe("Severance (Seasons 1–2), which you requested: all aired episodes are ready to watch");
  });

  it("knows nothing without a Sonarr", async () => {
    const old = await request(anna, { ...show, completeNoticeArmed: false });
    library.servers = library.servers.filter((s) => s.kind !== "sonarr");
    await checkCompletedRequests();
    expect(await requestRow(old.id)).toMatchObject({ notifiedCompleteAt: null, completeNoticeArmed: false });
  });
});

describe("requests from before these notices", () => {
  it("marks one that's already complete as told, without telling anyone", async () => {
    const old = await request(anna, { completeNoticeArmed: false });
    library.movieFiles.add("radarr");
    await checkCompletedRequests();
    expect((await requestRow(old.id)).notifiedCompleteAt).not.toBeNull();
    expect(await noticesFor(anna)).toEqual([]);
    expect(effects.fanOut).not.toHaveBeenCalled();
  });

  it("arms one that's still coming, and announces it when it arrives", async () => {
    const old = await request(anna, { completeNoticeArmed: false });
    await checkCompletedRequests();
    expect((await requestRow(old.id)).completeNoticeArmed).toBe(true);
    library.movieFiles.add("radarr");
    await checkCompletedRequests();
    expect(await noticesFor(anna)).toHaveLength(1);
  });

  it("the migration leaves existing requests unarmed and new ones armed", async () => {
    // A copy of the migrations without the one that added the column, run on
    // a fresh database with a request in it, then the rest.
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    const { sql } = await import("drizzle-orm");
    const source = path.resolve(__dirname, "../db/migrations");
    const folder = mkdtempSync(path.join(tmpdir(), "marquee-migrations-"));
    cpSync(source, folder, { recursive: true });
    const journalPath = path.join(folder, "meta/_journal.json");
    const journal = JSON.parse(readFileSync(journalPath, "utf8")) as { entries: { tag: string }[] };
    const index = journal.entries.findIndex((e) => e.tag === "0057_add_request_complete_notice");
    expect(index).toBeGreaterThan(0);
    writeFileSync(journalPath, JSON.stringify({ ...journal, entries: journal.entries.slice(0, index) }));

    const scratch = drizzle(new PGlite());
    await migrate(scratch, { migrationsFolder: folder });
    await scratch.execute(sql`insert into users (id, username, role) values ('00000000-0000-0000-0000-000000000001', 'anna', 'member')`);
    await scratch.execute(
      sql`insert into requests (requested_by_user_id, media_type, tmdb_id, title) values ('00000000-0000-0000-0000-000000000001', 'movie', 1, 'Old')`,
    );
    await migrate(scratch, { migrationsFolder: source });
    await scratch.execute(
      sql`insert into requests (requested_by_user_id, media_type, tmdb_id, title) values ('00000000-0000-0000-0000-000000000001', 'movie', 2, 'New')`,
    );
    const rows = await scratch.execute<{ title: string; complete_notice_armed: boolean; notified_complete_at: string | null }>(
      sql`select title, complete_notice_armed, notified_complete_at from requests order by tmdb_id`,
    );
    expect(rows.rows).toEqual([
      { title: "Old", complete_notice_armed: false, notified_complete_at: null },
      { title: "New", complete_notice_armed: true, notified_complete_at: null },
    ]);
  });
});
