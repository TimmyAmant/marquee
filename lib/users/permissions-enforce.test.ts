import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

// Permissions where they're enforced below the routes, against a real
// Postgres (PGlite): asking for each kind of title, Advanced picks, problem
// reports, auto-approval, request limits, who's told about a new request —
// and changing the switches themselves: only the admin, never on their own
// account or the admin's, never to anything but a known switch.

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", async () => (await import("@/lib/test/pglite")).testDatabase());
vi.mock("@/lib/cache/revalidate", () => ({ revalidatePathSafely: () => undefined }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/notifications/fan-out", () => ({ fanOut: vi.fn(async () => undefined) }));
vi.mock("@/lib/notifications/bus", () => ({ publishNotification: () => undefined }));
vi.mock("@/lib/push/deliver", () => ({ pushToUser: async () => 0, pushMessageFor: () => ({}), removeAllSubscriptions: async () => undefined }));
vi.mock("@/lib/requests/blocklist", () => ({ findBlock: async () => null, blockedMessage: () => "" }));
vi.mock("argon2", () => ({ hash: async () => "hash", verify: async () => true }));
vi.mock("@/lib/tmdb/cache", () => ({
  getOrFetchTitle: async (mediaType: string, tmdbId: number) => ({
    mediaType,
    tmdbId,
    name: mediaType === "tv" ? "Severance" : "Dune",
    posterPath: null,
    tvdbId: mediaType === "tv" ? 371980 : null,
    rawTmdb: { seasons: [{ season_number: 1, name: "Season 1", episode_count: 9 }] },
  }),
}));
vi.mock("@/lib/integrations/status", () => ({
  getSonarrSeasonStates: async () => null,
  getTitleLibraryStatus: async () => ({ status: "untracked", configured: true, file: null, provider: null }),
}));
vi.mock("@/lib/arr/fourk", () => ({
  isFourKReady: async () => true,
  getFourKStatus: async () => ({ configured: true, status: "untracked" }),
}));
vi.mock("@/lib/integrations/library-owner", async () => {
  const { db } = await (await import("@/lib/test/pglite")).testDatabase();
  const { users } = await import("@/lib/db/schema");
  const { eq } = await import("drizzle-orm");
  return {
    getLibraryOwnerUserId: async () => {
      const [admin] = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin"));
      return admin.id;
    },
  };
});
const arr = vi.hoisted(() => ({
  addMovieToRadarrForUser: vi.fn(async (..._args: unknown[]) => ({ ok: true as const, placement: { serverId: null, serverName: "Radarr", qualityProfileId: 4, rootFolderPath: "/movies", tags: [], seriesType: null } })),
  addSeriesToSonarrForUser: vi.fn(async (..._args: unknown[]) => ({ ok: true as const, placement: { serverId: null, serverName: "Sonarr", qualityProfileId: 4, rootFolderPath: "/tv", tags: [], seriesType: null } })),
}));
vi.mock("@/lib/arr/title-actions", () => arr);

import { resetTestDatabase, testDatabase } from "@/lib/test/pglite";
import { notifications, requests, users } from "@/lib/db/schema";
import { approveRequest, createRequest } from "@/lib/requests/mutate";
import { getQuota } from "@/lib/requests/quota";
import { reportIssue } from "@/lib/issues";
import { updateHouseholdMember } from "@/lib/users/household";
import { MEMBER_PRESET, PERMISSIONS, presetFor, TRUSTED_PRESET, type Permission } from "@/lib/users/permissions";

async function db() {
  return (await testDatabase()).db;
}

let admin: string;

async function addUser(username: string, role: "admin" | "member" | "trusted", permissions: readonly string[], extra: Partial<typeof users.$inferInsert> = {}) {
  const [row] = await (await db())
    .insert(users)
    .values({ username, role, permissions: [...permissions], ...extra })
    .returning({ id: users.id });
  return row.id;
}

async function userRow(id: string) {
  const [row] = await (await db()).select().from(users).where(eq(users.id, id));
  return row;
}

const viewer = (userId: string) => ({ userId, isAdmin: false, libraryOwnerId: admin });
const without = (...removed: Permission[]) => MEMBER_PRESET.filter((p) => !removed.includes(p));
const movie = { mediaType: "movie" as const, tmdbId: 438631, title: "Dune", posterPath: null };
const show = { mediaType: "tv" as const, tmdbId: 95396, title: "Severance", posterPath: null };

beforeEach(async () => {
  await resetTestDatabase();
  vi.clearAllMocks();
  admin = await addUser("admin", "admin", []);
});

describe("asking for titles", () => {
  it("needs the switch for that kind of title", async () => {
    const noTv = await addUser("notv", "member", without("requestTv"));
    expect(await createRequest(viewer(noTv), show)).toMatchObject({ ok: false, code: "forbidden", error: "Requesting TV isn't turned on for your account." });
    expect(await createRequest(viewer(noTv), movie)).toMatchObject({ ok: true });

    const noMovies = await addUser("nomovies", "member", without("requestMovies"));
    expect(await createRequest(viewer(noMovies), movie)).toMatchObject({ ok: false, code: "forbidden" });
    expect(await createRequest(viewer(noMovies), show)).toMatchObject({ ok: true });

    const no4k = await addUser("no4k", "member", without("request4kMovies"));
    expect(await createRequest(viewer(no4k), { ...movie, is4k: true })).toMatchObject({ ok: false, code: "forbidden" });
    expect(await createRequest(viewer(no4k), { ...show, is4k: true })).toMatchObject({ ok: true });
  });

  it("keeps Advanced picks for whoever has advancedRequests, and uses them on approval", async () => {
    const plain = await addUser("plain", "member", MEMBER_PRESET);
    const picks = { serverId: "radarr-2", qualityProfileId: 7 };
    expect(await createRequest(viewer(plain), { ...movie, overrides: picks })).toMatchObject({ ok: false, code: "forbidden" });

    const advanced = await addUser("advanced", "member", [...MEMBER_PRESET, "advancedRequests"]);
    const created = await createRequest(viewer(advanced), { ...movie, overrides: picks });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const [row] = await (await db()).select().from(requests).where(eq(requests.id, created.requestId));
    expect(row.addOverrides).toEqual(picks);
    expect(await approveRequest(created.requestId, admin)).toEqual({ ok: true });
    expect(arr.addMovieToRadarrForUser).toHaveBeenCalledWith(admin, 438631, false, picks);
  });

  it("approves straight away by the auto-approve switch for that kind of title", async () => {
    const auto4k = await addUser("auto4k", "member", [...MEMBER_PRESET, "autoApprove4kMovies"]);
    const regular = await createRequest(viewer(auto4k), movie);
    const fourK = await createRequest(viewer(auto4k), { ...movie, is4k: true });
    const status = async (result: typeof regular) =>
      result.ok ? (await (await db()).select().from(requests).where(eq(requests.id, result.requestId)))[0].status : null;
    expect(await status(regular)).toBe("pending");
    expect(await status(fourK)).toBe("approved");
  });

  it("lifts request limits only with bypassLimits", async () => {
    const limited = await addUser("limited", "member", MEMBER_PRESET, { movieQuotaLimit: 1 });
    const unlimited = await addUser("unlimited", "member", [...MEMBER_PRESET, "bypassLimits"], { movieQuotaLimit: 1 });
    expect(await getQuota(limited, "movie")).toMatchObject({ limit: 1 });
    expect(await getQuota(unlimited, "movie")).toBeNull();
    // The role alone does nothing.
    const trustedRoleOnly = await addUser("oddity", "trusted", MEMBER_PRESET, { movieQuotaLimit: 1 });
    expect(await getQuota(trustedRoleOnly, "movie")).toMatchObject({ limit: 1 });
  });

  it("tells whoever may review requests — by switch, not role", async () => {
    const reviewer = await addUser("reviewer", "member", [...MEMBER_PRESET, "reviewRequests"]);
    await addUser("looker", "member", [...MEMBER_PRESET, "viewRequests"]);
    const anna = await addUser("anna", "member", MEMBER_PRESET);
    const created = await createRequest(viewer(anna), movie);
    expect(created.ok).toBe(true);
    const alerts = await (await db()).select().from(notifications).where(eq(notifications.eventType, "request_created"));
    expect(alerts.map((a) => a.userId).sort()).toEqual([admin, reviewer].sort());
  });
});

describe("problem reports", () => {
  it("need reportIssues", async () => {
    const quiet = await addUser("quiet", "member", without("reportIssues"));
    expect(await reportIssue(quiet, "movie", 603, { kind: "audio", message: "" })).toMatchObject({ ok: false, code: "forbidden" });
    const anna = await addUser("anna", "member", MEMBER_PRESET);
    expect(await reportIssue(anna, "movie", 603, { kind: "audio", message: "" })).toMatchObject({ ok: true });
  });
});

describe("changing someone's permissions", () => {
  const edit = (actor: { userId: string; isAdmin: boolean }, userId: string, extra: Record<string, unknown>) =>
    updateHouseholdMember(actor, { userId, username: extra.username ?? "anna", displayName: undefined, password: undefined, ...extra });

  it("is the admin's alone — a member can't grant themselves anything", async () => {
    const anna = await addUser("anna", "member", MEMBER_PRESET);
    const result = await edit({ userId: anna, isAdmin: false }, anna, { permissions: { reviewRequests: true, manageBlocklist: true } });
    expect(result).toMatchObject({ ok: false, code: "forbidden" });
    // The old fields are ignored from a member, as they always were.
    expect(await edit({ userId: anna, isAdmin: false }, anna, { role: "trusted", autoApproveMovies: true })).toMatchObject({ ok: true });
    const row = await userRow(anna);
    expect(row.role).toBe("member");
    expect([...row.permissions].sort()).toEqual([...MEMBER_PRESET].sort());
  });

  it("can't touch the admin's own switches, or the admin's account", async () => {
    expect(await edit({ userId: admin, isAdmin: true }, admin, { username: "admin", permissions: { requestTv: false } })).toMatchObject({ ok: false });
    const anna = await addUser("anna", "member", MEMBER_PRESET);
    expect(await edit({ userId: anna, isAdmin: false }, admin, { username: "admin", permissions: { requestTv: false } })).toMatchObject({
      ok: false,
      code: "forbidden",
    });
    expect((await userRow(admin)).role).toBe("admin");
  });

  it("refuses unknown switches", async () => {
    const anna = await addUser("anna", "member", MEMBER_PRESET);
    expect(await edit({ userId: admin, isAdmin: true }, anna, { permissions: { manageSettings: true } })).toMatchObject({ ok: false, code: "invalid" });
    expect(await edit({ userId: admin, isAdmin: true }, anna, { permissions: { admin: true } })).toMatchObject({ ok: false, code: "invalid" });
  });

  it("changes only the switches sent, and works the role out", async () => {
    const anna = await addUser("anna", "member", MEMBER_PRESET);
    expect(await edit({ userId: admin, isAdmin: true }, anna, { permissions: { requestTv: false, manageBlocklist: true } })).toEqual({
      ok: true,
      passwordChanged: false,
    });
    let row = await userRow(anna);
    expect(new Set(row.permissions)).toEqual(new Set(["requestMovies", "request4kMovies", "request4kTv", "reportIssues", "manageBlocklist"]));
    expect(row.role).toBe("member");

    // Every Trusted switch: stored as trusted, for older apps that read the role.
    const all = Object.fromEntries(PERMISSIONS.map((p) => [p, TRUSTED_PRESET.includes(p)]));
    await edit({ userId: admin, isAdmin: true }, anna, { permissions: all });
    row = await userRow(anna);
    expect(row.role).toBe("trusted");
    expect(presetFor(row)).toBe("trusted");
    expect(row.autoApproveMovies).toBe(true);
  });

  it("treats the old role and auto-approve fields as a preset and flags — only when they change something", async () => {
    const anna = await addUser("anna", "member", [...MEMBER_PRESET, "viewRequests"]);
    // An older app saving the member as they are changes nothing.
    await edit({ userId: admin, isAdmin: true }, anna, { role: "member", autoApproveMovies: false, autoApproveTv: false });
    expect((await userRow(anna)).permissions).toContain("viewRequests");

    // Turning movies' auto-approval on covers their 4K movie requests too, as it did.
    await edit({ userId: admin, isAdmin: true }, anna, { role: "member", autoApproveMovies: true, autoApproveTv: false });
    let row = await userRow(anna);
    expect(row.permissions).toEqual(expect.arrayContaining(["autoApproveMovies", "autoApprove4kMovies", "viewRequests"]));
    expect(row.autoApproveMovies).toBe(true);

    // Picking Trusted fills that preset in.
    await edit({ userId: admin, isAdmin: true }, anna, { role: "trusted" });
    row = await userRow(anna);
    expect(row.role).toBe("trusted");
    expect(presetFor(row)).toBe("trusted");

    // …and Member takes it back to the Member preset.
    await edit({ userId: admin, isAdmin: true }, anna, { role: "member" });
    row = await userRow(anna);
    expect(presetFor(row)).toBe("member");
  });
});
