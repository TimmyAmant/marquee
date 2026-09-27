import { beforeEach, describe, expect, it, vi } from "vitest";
import { asc, eq } from "drizzle-orm";
import { presetPermissions } from "@/lib/users/permissions";

// Import from Seerr end to end, against a real Postgres (PGlite) and a
// Seerr answering with the shapes recorded from a real Seerr 3.4.1
// (scratch fixtures, trimmed): who becomes whom, what each request and
// report turns into, that running it twice changes nothing, and the
// /api/v1 routes around it (admin only).

vi.mock("server-only", () => ({}));
vi.mock("@/auth", () => ({ auth: async () => null, signIn: async () => undefined, signOut: async () => undefined, handlers: {} }));
vi.mock("@/lib/db/client", async () => (await import("@/lib/test/pglite")).testDatabase());
vi.mock("@/lib/cache/revalidate", () => ({ revalidatePathSafely: () => undefined }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/tmdb/client", () => ({ isTmdbConfigured: async () => tmdb.configured }));
vi.mock("@/lib/tmdb/cache", () => ({
  getOrFetchTitle: async (mediaType: string, tmdbId: number) => {
    if (tmdbId === 27205) return null; // gone from TMDb
    return { mediaType, tmdbId, name: `${mediaType} ${tmdbId}`, posterPath: `/p${tmdbId}.jpg` };
  },
}));

const tmdb = vi.hoisted(() => ({ configured: true }));
const seerr = vi.hoisted(() => ({ users: [] as unknown[], requests: [] as unknown[], issues: [] as unknown[], blocklist: [] as unknown[], radarr: [] as unknown[], sonarr: [] as unknown[], me: {} as unknown, quotas: new Map<number, unknown>() }));
vi.mock("@/lib/import/seerr/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/import/seerr/client")>();
  return {
    ...actual,
    fetchSeerrStatus: async () => ({ version: "3.4.1", commitTag: "69f73a6" }),
    fetchSeerrMe: async () => seerr.me,
    fetchSeerrMainSettings: async () => ({ applicationTitle: "Family Seerr" }),
    fetchSeerrUsers: async () => seerr.users,
    fetchSeerrUserQuota: async (_c: unknown, id: number) => seerr.quotas.get(id) ?? null,
    fetchSeerrRequests: async () => seerr.requests,
    // As Seerr 3.4.1 answers: the listing's comments have no `user`; the
    // report on its own has them.
    fetchSeerrIssues: async () =>
      (seerr.issues as SeerrIssue[]).map((issue) => ({ ...issue, comments: issue.comments?.map(({ id, message, createdAt }) => ({ id, message, createdAt })) })),
    fetchSeerrIssue: async (_c: unknown, id: number) => {
      const found = (seerr.issues as SeerrIssue[]).find((issue) => issue.id === id);
      if (!found) throw new Error("no such issue");
      return found;
    },
    fetchSeerrBlocklist: async () => seerr.blocklist,
    fetchSeerrRadarrServers: async () => seerr.radarr,
    fetchSeerrSonarrServers: async () => seerr.sonarr,
  };
});

const tokens = vi.hoisted(() => new Map<string, () => { id: string; role: string }>());
vi.mock("@/lib/api/token-store", () => ({
  authenticateApiToken: async (token: string) => {
    const who = tokens.get(token)?.();
    if (!who) return null;
    return {
      tokenId: "t",
      tokenName: "test",
      expiresAt: new Date("2030-01-01"),
      user: { id: who.id, username: who.role, displayName: null, role: who.role, permissions: presetPermissions("trusted"), avatarUpdatedAt: null, createdAt: new Date() },
    };
  },
}));

import { resetTestDatabase, testDatabase } from "@/lib/test/pglite";
import { arrServers, comments, importLinks, issues, requestBlocklist, requests, users } from "@/lib/db/schema";
import { getSeerrImportJob, previewSeerrImport, runSeerrImport, startSeerrImport, type SeerrImportChoices } from "@/lib/import/seerr/import";
import type { SeerrIssue } from "@/lib/import/seerr/types";
import * as testRoute from "@/app/api/v1/settings/import/seerr/test/route";
import * as previewRoute from "@/app/api/v1/settings/import/seerr/preview/route";
import * as runRoute from "@/app/api/v1/settings/import/seerr/run/route";
import * as jobRoute from "@/app/api/v1/settings/import/seerr/jobs/[id]/route";

// ── Seerr, as recorded ──────────────────────────────────────────────────

const ADMIN = { id: 1, email: "seerradmin@example.test", username: "seerradmin", displayName: "seerradmin", userType: 3, plexId: null, jellyfinUserId: "eddf4dd3e13a4f6ba31b79e6ec9e84b0", permissions: 2 };
const ANNA = { id: 2, email: null, username: "anna", displayName: "anna", userType: 3, plexId: null, jellyfinUserId: "dbc2d597e1974723996abce83eaa72c6", permissions: 4980864 };
const BOB = { id: 3, email: "bob@example.test", username: "bob", displayName: "Bob Local", userType: 2, plexId: null, jellyfinUserId: null, permissions: 4203568, movieQuotaLimit: 5, movieQuotaDays: 7, tvQuotaLimit: 2, tvQuotaDays: 14 };
const CAROL = { id: 4, email: "carol@example.test", username: "carol", displayName: "carol", userType: 2, plexId: null, jellyfinUserId: null, permissions: 32 };
const DAVE = { id: 5, email: "dave@example.test", username: "dave", displayName: "dave", userType: 1, plexId: 424242, jellyfinUserId: null, permissions: 32 };

const at = (s: string) => `2026-09-27T02:0${s}.000Z`;
const REQUESTS = [
  { id: 8, status: 1, type: "tv", media: { id: 4, mediaType: "tv", tmdbId: 1399 }, requestedBy: CAROL, modifiedBy: null, is4k: false, seasons: [{ seasonNumber: 1 }], createdAt: at("7:05"), updatedAt: at("7:05") },
  { id: 7, status: 1, type: "movie", media: { id: 1, mediaType: "movie", tmdbId: 603 }, requestedBy: BOB, modifiedBy: null, is4k: false, seasons: [], createdAt: at("7:05"), updatedAt: at("7:05") },
  { id: 6, status: 2, type: "movie", media: { id: 5, mediaType: "movie", tmdbId: 157336 }, requestedBy: BOB, modifiedBy: ADMIN, is4k: true, seasons: [], serverId: 0, profileId: 4, rootFolder: "/movies", tags: [7], createdAt: at("6:22"), updatedAt: at("6:40") },
  { id: 4, status: 2, type: "tv", media: { id: 3, mediaType: "tv", tmdbId: 1396 }, requestedBy: BOB, modifiedBy: ADMIN, is4k: false, seasons: [{ seasonNumber: 2 }, { seasonNumber: 1 }], serverId: 0, createdAt: at("6:22"), updatedAt: at("6:22") },
  { id: 3, status: 3, type: "movie", media: { id: 2, mediaType: "movie", tmdbId: 27205 }, requestedBy: ANNA, modifiedBy: ADMIN, is4k: false, seasons: [], createdAt: at("6:22"), updatedAt: at("6:23") },
  { id: 2, status: 2, type: "movie", media: { id: 6, mediaType: "movie", tmdbId: 550 }, requestedBy: CAROL, modifiedBy: ADMIN, is4k: false, seasons: [], createdAt: at("6:22"), updatedAt: at("6:22") },
  { id: 9, status: 1, type: "movie", media: { id: 9, mediaType: "movie", tmdbId: 680 }, requestedBy: DAVE, modifiedBy: null, is4k: false, seasons: [], createdAt: at("7:30"), updatedAt: at("7:30") },
];

const ISSUES = [
  {
    id: 1, issueType: 1, status: 1, problemSeason: 0, problemEpisode: 0, media: { id: 1, mediaType: "movie", tmdbId: 603 }, createdBy: BOB, modifiedBy: null, createdAt: at("7:10"), updatedAt: at("7:10"),
    comments: [
      { id: 1, user: BOB, message: "Video stutters at 10 min", createdAt: at("7:10") },
      { id: 2, user: ADMIN, message: "Same here", createdAt: at("7:10") },
      { id: 3, user: ADMIN, message: "Happens on the 1080p file only", createdAt: at("7:10") },
    ],
  },
  {
    id: 2, issueType: 3, status: 2, problemSeason: 1, problemEpisode: 3, media: { id: 3, mediaType: "tv", tmdbId: 1396 }, createdBy: CAROL, modifiedBy: ADMIN, createdAt: at("7:11"), updatedAt: at("7:12"),
    comments: [
      { id: 4, user: CAROL, message: "Subtitles out of sync in S01E03", createdAt: at("7:11") },
      { id: 5, user: ADMIN, message: "Re-muxed, fixed", createdAt: at("7:12") },
    ],
  },
];

const BLOCKLIST = [
  { id: 1, mediaType: "movie", tmdbId: 8392, title: "My Neighbor Totoro", createdAt: at("7:20") },
  { id: 2, mediaType: "tv", tmdbId: 1402, title: "The Walking Dead", createdAt: at("7:20") },
];

const RADARR = [{ id: 0, name: "Radarr Main", hostname: "Radarr.local", port: 7878, useSsl: false, baseUrl: "", is4k: false, isDefault: true }];
const SONARR = [{ id: 0, name: "Sonarr Main", hostname: "sonarr.local", port: 8989, useSsl: false, baseUrl: "", is4k: false, isDefault: true }];

// ── Marquee ─────────────────────────────────────────────────────────────

const ids = { admin: "", anna: "", carol: "" };
const TOKEN = { admin: "mqt_" + "a".repeat(43), member: "mqt_" + "m".repeat(43) };
tokens.set(TOKEN.admin, () => ({ id: ids.admin, role: "admin" }));
tokens.set(TOKEN.member, () => ({ id: ids.anna, role: "trusted" }));

const INPUT = { url: "http://seerr.local:5055/", apiKey: "k-secret" };
const ALL: SeerrImportChoices = { users: true, updateExistingUsers: false, requests: true, issues: true, blocklist: true };

async function db() {
  return (await testDatabase()).db;
}

beforeEach(async () => {
  await resetTestDatabase();
  tmdb.configured = true;
  seerr.me = ADMIN;
  seerr.users = [ADMIN, ANNA, BOB, CAROL, DAVE];
  seerr.quotas = new Map<number, unknown>([
    [3, { movie: { days: 7, limit: 5 }, tv: { days: 14, limit: 2 } }],
    [4, { movie: { days: 30, limit: 10 }, tv: { days: 30, limit: 3 } }],
  ]);
  seerr.requests = REQUESTS;
  seerr.issues = ISSUES;
  seerr.blocklist = BLOCKLIST;
  seerr.radarr = RADARR;
  seerr.sonarr = SONARR;
  const d = await db();
  [{ id: ids.admin }] = await d.insert(users).values({ username: "tester", role: "admin", permissions: [] }).returning({ id: users.id });
  [{ id: ids.anna }] = await d
    .insert(users)
    .values({ username: "anna", role: "member", permissions: presetPermissions("member"), jellyfinUserId: ANNA.jellyfinUserId })
    .returning({ id: users.id });
  [{ id: ids.carol }] = await d.insert(users).values({ username: "Carol", role: "member", permissions: presetPermissions("member") }).returning({ id: users.id });
  await d.insert(arrServers).values({
    userId: ids.admin,
    kind: "radarr",
    name: "Radarr",
    baseUrl: "http://radarr.local:7878",
    apiKeyEnc: Buffer.from("x"),
    apiKeyIv: Buffer.from("x"),
    apiKeyTag: Buffer.from("x"),
    isDefault: true,
    webhookSecret: "s",
  });
});

describe("preview", () => {
  it("says who becomes whom and what would be imported", async () => {
    const result = await previewSeerrImport(ids.admin, INPUT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { preview } = result;
    expect(preview.server).toEqual({ url: "http://seerr.local:5055", version: "3.4.1", applicationTitle: "Family Seerr", adminName: "seerradmin" });
    expect(preview.users).toMatchObject({ total: 5, you: 1, matched: 2, new: 2, imported: 0 });
    const by = Object.fromEntries(preview.users.items.map((i) => [i.seerrId, i]));
    expect(by[1]).toMatchObject({ outcome: "you", isAdmin: true, kind: "jellyfin" });
    expect(by[2]).toMatchObject({ outcome: "matched", matchedTo: "anna", matchedBy: "jellyfin", permissions: ["requestMovies", "requestTv", "autoApproveMovies", "autoApproveTv", "reportIssues"] });
    expect(by[3]).toMatchObject({ outcome: "new", kind: "local", movieQuotaLimit: 5, movieQuotaDays: 7, tvQuotaLimit: 2, tvQuotaDays: 14 });
    expect(by[3].permissions).toEqual(["requestMovies", "requestTv", "request4kMovies", "request4kTv", "advancedRequests", "viewRequests", "reviewRequests", "reportIssues"]);
    expect(by[4]).toMatchObject({ outcome: "matched", matchedTo: "Carol", matchedBy: "username", movieQuotaLimit: 10, tvQuotaLimit: 3 });
    expect(by[5]).toMatchObject({ outcome: "new", kind: "plex" });
    expect(preview.requests).toMatchObject({ total: 7, new: 7, imported: 0, pending: 3, approved: 3, rejected: 1, fourK: 1, withoutRequester: 0 });
    expect(preview.requests.servers).toEqual([
      { name: "Sonarr Main", kind: "sonarr", matchedTo: null },
      { name: "Radarr Main", kind: "radarr", matchedTo: "Radarr" },
    ]);
    expect(preview.issues).toMatchObject({ total: 2, new: 2, imported: 0, comments: 3 });
    expect(preview.blocklist).toMatchObject({ total: 2, new: 2, imported: 0 });
    expect(preview.warnings.map((w) => w.code)).toEqual(["seerr_admin_is_you", "local_users_no_password", "arr_server_unmatched", "notifications_not_imported"]);
    expect(preview.tmdbConfigured).toBe(true);
  });

  it("refuses a key that isn't an admin's, and a bad address", async () => {
    seerr.me = { ...BOB };
    expect(await previewSeerrImport(ids.admin, INPUT)).toMatchObject({ ok: false, code: "forbidden" });
    expect(await previewSeerrImport(ids.admin, { url: "seerr.local", apiKey: "k" })).toMatchObject({ ok: false, code: "invalid" });
    expect(await previewSeerrImport(ids.admin, { url: "http://seerr.local", apiKey: "" })).toMatchObject({ ok: false, code: "invalid" });
  });
});

describe("run", () => {
  it("brings everything over, mapped, and only once", async () => {
    const d = await db();
    const first = await runSeerrImport(ids.admin, INPUT, ALL);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const { report } = first;

    // Accounts: bob and dave created, anna and carol matched, the owner is you.
    expect(report.users.created.map((u) => [u.seerrId, u.username, u.kind])).toEqual([
      [3, "bob", "local"],
      [5, "dave", "plex"],
    ]);
    expect(report.users.matched.map((u) => [u.seerrId, u.username, u.updated])).toEqual([
      [1, "tester", false],
      [2, "anna", false],
      [4, "Carol", false],
    ]);
    const [bob] = await d.select().from(users).where(eq(users.username, "bob"));
    expect(bob).toMatchObject({
      displayName: "Bob Local",
      passwordHash: null,
      role: "member",
      plexUserId: null,
      jellyfinUserId: null,
      permissions: ["requestMovies", "requestTv", "request4kMovies", "request4kTv", "advancedRequests", "viewRequests", "reviewRequests", "reportIssues"],
      movieQuotaLimit: 5,
      movieQuotaDays: 7,
      tvQuotaLimit: 2,
      tvQuotaDays: 14,
    });
    const [dave] = await d.select().from(users).where(eq(users.username, "dave"));
    expect(dave).toMatchObject({ plexUserId: "424242", permissions: ["requestMovies", "requestTv"] });
    // Matched accounts keep their own switches unless asked.
    const [anna] = await d.select().from(users).where(eq(users.id, ids.anna));
    expect(anna.permissions).toEqual(presetPermissions("member"));
    const [admin] = await d.select().from(users).where(eq(users.id, ids.admin));
    expect(admin).toMatchObject({ role: "admin", permissions: [] });

    // Requests.
    expect(report.requests).toEqual({ created: 7, skipped: 0, failed: [], titlesWithoutTmdb: 1 });
    const rows = await d.select().from(requests).orderBy(asc(requests.createdAt), asc(requests.tmdbId));
    const byTmdb = Object.fromEntries(rows.map((r) => [`${r.tmdbId}:${r.is4k}`, r]));
    expect(byTmdb["1396:false"]).toMatchObject({
      requestedByUserId: bob.id,
      mediaType: "tv",
      status: "approved",
      seasons: [1, 2],
      title: "tv 1396",
      posterPath: "/p1396.jpg",
      reviewedByUserId: ids.admin,
      reviewedAt: new Date(at("6:22")),
      createdAt: new Date(at("6:22")),
      // No Marquee Sonarr at that address: the name stays, no server.
      arrServerId: null,
      arrServerName: "Sonarr Main",
      manuallyApproved: false,
    });
    expect(byTmdb["157336:true"]).toMatchObject({ is4k: true, status: "approved", arrServerName: "Radarr", arrQualityProfileId: 4, arrRootFolderPath: "/movies", arrTags: [7], reviewedAt: new Date(at("6:40")) });
    expect(byTmdb["157336:true"].arrServerId).not.toBeNull();
    expect(byTmdb["27205:false"]).toMatchObject({ requestedByUserId: ids.anna, status: "rejected", rejectionReason: null, title: "TMDb movie #27205", posterPath: null });
    expect(byTmdb["603:false"]).toMatchObject({ status: "pending", reviewedByUserId: null, reviewedAt: null, seasons: null });
    expect(byTmdb["1399:false"]).toMatchObject({ requestedByUserId: ids.carol, status: "pending", seasons: [1] });
    expect(byTmdb["680:false"]).toMatchObject({ requestedByUserId: dave.id, status: "pending" });

    // Problem reports and comments.
    expect(report.issues).toEqual({ created: 2, comments: 3, skipped: 0, failed: [] });
    const reports = await d.select().from(issues).orderBy(asc(issues.createdAt));
    expect(reports[0]).toMatchObject({ reportedByUserId: bob.id, kind: "video", message: "Video stutters at 10 min", status: "open", seasonNumber: null, episodeNumber: null, resolvedAt: null, title: "movie 603" });
    expect(reports[1]).toMatchObject({ reportedByUserId: ids.carol, kind: "subtitles", message: "Subtitles out of sync in S01E03", status: "resolved", seasonNumber: 1, episodeNumber: 3, resolvedByUserId: ids.admin, resolvedAt: new Date(at("7:12")) });
    const thread = await d.select().from(comments).orderBy(asc(comments.createdAt), asc(comments.body));
    expect(thread.map((c) => [c.issueId === reports[0].id ? "video" : "subs", c.authorUserId === ids.admin ? "admin" : "?", c.body])).toEqual([
      ["video", "admin", "Happens on the 1080p file only"],
      ["video", "admin", "Same here"],
      ["subs", "admin", "Re-muxed, fixed"],
    ]);

    // Blocklist.
    expect(report.blocklist).toEqual({ created: 2, skipped: 0, failed: [] });
    expect((await d.select().from(requestBlocklist)).map((b) => [b.kind, b.mediaType, b.tmdbId, b.title])).toEqual([
      ["title", "movie", 8392, "My Neighbor Totoro"],
      ["title", "tv", 1402, "The Walking Dead"],
    ]);
    expect(report.warnings.map((w) => w.code)).toEqual(["seerr_admin_is_you", "local_users_no_password", "arr_server_unmatched", "notifications_not_imported"]);

    // Everything is remembered, keyed by this Seerr.
    const links = await d.select().from(importLinks);
    expect(links.every((l) => l.instance === "seerr.local:5055")).toBe(true);
    expect(links.filter((l) => l.kind === "user")).toHaveLength(5);
    expect(links.filter((l) => l.kind === "request")).toHaveLength(7);
    expect(links.filter((l) => l.kind === "comment")).toHaveLength(3);

    // Running it again changes nothing.
    const second = await runSeerrImport(ids.admin, INPUT, ALL);
    expect(second.ok && second.report).toMatchObject({
      users: { created: [], matched: expect.arrayContaining([expect.objectContaining({ seerrId: 3, username: "bob" })]) },
      requests: { created: 0, skipped: 7, failed: [] },
      issues: { created: 0, comments: 0, skipped: 2, failed: [] },
      blocklist: { created: 0, skipped: 2, failed: [] },
    });
    expect(await d.select().from(users)).toHaveLength(5);
    expect(await d.select().from(requests)).toHaveLength(7);
    expect(await d.select().from(comments)).toHaveLength(3);
    const again = await previewSeerrImport(ids.admin, INPUT);
    // Matched accounts are linked now, so they count as imported.
    expect(again.ok && again.preview.users).toMatchObject({ imported: 4, matched: 0, you: 1, new: 0 });
    expect(again.ok && again.preview.requests).toMatchObject({ new: 0, imported: 7 });

    // Something deleted here since comes back, and the report says so.
    await d.delete(requests).where(eq(requests.tmdbId, 603));
    const third = await runSeerrImport(ids.admin, INPUT, ALL);
    expect(third.ok && third.report.requests).toMatchObject({ created: 1, skipped: 6 });
    expect(third.ok && third.report.warnings).toContainEqual({ code: "links_dropped", count: 1 });
  });

  it("recognises requests made by hand before the import, and a duplicate pending one", async () => {
    const d = await db();
    await d.insert(requests).values({ requestedByUserId: ids.carol, mediaType: "movie", tmdbId: 550, title: "Fight Club", status: "approved", reviewedByUserId: ids.admin, reviewedAt: new Date() });
    await d.insert(requests).values({ requestedByUserId: ids.carol, mediaType: "tv", tmdbId: 1399, title: "GoT", status: "pending", seasons: [1, 2, 3] });
    const result = await runSeerrImport(ids.admin, INPUT, { ...ALL, issues: false, blocklist: false });
    expect(result.ok && result.report.requests).toEqual({ created: 5, skipped: 2, failed: [], titlesWithoutTmdb: 1 });
    expect(await d.select().from(requests)).toHaveLength(7);
  });

  it("updates matched accounts' switches and limits only when asked, never the admin's", async () => {
    const d = await db();
    const result = await runSeerrImport(ids.admin, INPUT, { ...ALL, updateExistingUsers: true, requests: false, issues: false, blocklist: false });
    expect(result.ok && result.report.users.matched.map((u) => [u.seerrId, u.updated])).toEqual([
      [1, false],
      [2, true],
      [4, true],
    ]);
    const [anna] = await d.select().from(users).where(eq(users.id, ids.anna));
    expect(anna.permissions).toEqual(["requestMovies", "requestTv", "autoApproveMovies", "autoApproveTv", "reportIssues"]);
    expect(anna.autoApproveMovies).toBe(true);
    const [carol] = await d.select().from(users).where(eq(users.id, ids.carol));
    expect(carol).toMatchObject({ permissions: ["requestMovies", "requestTv"], movieQuotaLimit: 10, movieQuotaDays: 30, tvQuotaLimit: 3, tvQuotaDays: 30 });
    const [admin] = await d.select().from(users).where(eq(users.id, ids.admin));
    expect(admin).toMatchObject({ role: "admin", permissions: [], movieQuotaLimit: null });
  });

  it("leaves out requests by people who aren't here when accounts aren't imported", async () => {
    const result = await runSeerrImport(ids.admin, INPUT, { ...ALL, users: false, issues: false, blocklist: false });
    expect(result.ok && result.report.requests).toMatchObject({
      created: 3,
      failed: [4, 6, 7, 9].map((seerrId) => ({ seerrId, reason: "requester_missing" })),
    });
    expect(result.ok && result.report.warnings).toContainEqual({ code: "requests_without_requester", count: 4 });
    expect(await (await db()).select().from(users)).toHaveLength(3);
  });

  it("insists on TMDb for requests and reports, and on choosing something", async () => {
    tmdb.configured = false;
    expect(await runSeerrImport(ids.admin, INPUT, ALL)).toMatchObject({ ok: false, code: "conflict" });
    const onlyUsers = await runSeerrImport(ids.admin, INPUT, { ...ALL, requests: false, issues: false });
    expect(onlyUsers.ok).toBe(true);
    expect(await runSeerrImport(ids.admin, INPUT, { users: false, updateExistingUsers: false, requests: false, issues: false, blocklist: false })).toMatchObject({ ok: false, code: "invalid" });
  });
});

// ── Routes ──────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each route types its own params
type Handler = (request: Request, context: { params: Promise<any> }) => Promise<Response>;
async function call(handler: Handler, token: string, method: string, body?: unknown, params: Record<string, string> = {}) {
  const response = await handler(
    new Request("http://marquee.test/api/v1/settings/import/seerr", {
      method,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    { params: Promise.resolve(params) },
  );
  return { status: response.status, body: await response.json() };
}

describe("/api/v1/settings/import/seerr", () => {
  it("is the admin's alone", async () => {
    for (const [handler, method] of [
      [testRoute.POST, "POST"],
      [previewRoute.POST, "POST"],
      [runRoute.POST, "POST"],
      [jobRoute.GET, "GET"],
    ] as const) {
      const response = await call(handler as Handler, TOKEN.member, method, method === "GET" ? undefined : INPUT, { id: crypto.randomUUID() });
      expect(response).toEqual({ status: 403, body: { error: "Only the admin can import from Seerr.", code: "forbidden" } });
    }
  });

  it("tests, previews, runs in the background and reports", async () => {
    expect(await call(testRoute.POST, TOKEN.admin, "POST", INPUT)).toEqual({
      status: 200,
      body: { ok: true, server: { url: "http://seerr.local:5055", version: "3.4.1", applicationTitle: "Family Seerr", adminName: "seerradmin" } },
    });
    expect(await call(testRoute.POST, TOKEN.admin, "POST", { url: "http://seerr.local", apiKey: "" })).toMatchObject({ status: 400, body: { code: "invalid" } });

    const preview = await call(previewRoute.POST, TOKEN.admin, "POST", INPUT);
    expect(preview.status).toBe(200);
    expect(preview.body.users.total).toBe(5);

    const started = await call(runRoute.POST, TOKEN.admin, "POST", { ...INPUT, issues: false, blocklist: false });
    expect(started.status).toBe(202);
    expect(started.body).toMatchObject({ state: "running", phase: "connecting" });
    // A second one can't start while it runs.
    expect(await call(runRoute.POST, TOKEN.admin, "POST", INPUT)).toMatchObject({ status: 409, body: { code: "conflict" } });

    for (let i = 0; i < 100 && getSeerrImportJob(started.body.id)?.state === "running"; i++) await new Promise((r) => setTimeout(r, 20));
    const finished = await call(jobRoute.GET, TOKEN.admin, "GET", undefined, { id: started.body.id });
    expect(finished.status).toBe(200);
    expect(finished.body).toMatchObject({ state: "done", phase: "done", report: { requests: { created: 7 }, issues: { created: 0 }, choices: { issues: false, blocklist: false, users: true } } });
    expect(finished.body.error).toBeNull();
    expect(await call(jobRoute.GET, TOKEN.admin, "GET", undefined, { id: crypto.randomUUID() })).toMatchObject({ status: 404 });
    expect(await call(jobRoute.GET, TOKEN.admin, "GET", undefined, { id: "nope" })).toMatchObject({ status: 404 });
  });

  it("reports a failed run through the job", async () => {
    seerr.me = { ...BOB };
    const result = await startSeerrImport(ids.admin, INPUT, ALL);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (let i = 0; i < 100 && getSeerrImportJob(result.job.id)?.state === "running"; i++) await new Promise((r) => setTimeout(r, 20));
    expect(getSeerrImportJob(result.job.id)).toMatchObject({ state: "failed", error: "That API key isn't an admin's. Use the key from Settings → General in Seerr.", report: null });
  });
});
