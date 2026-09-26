import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

// The request lifecycle against a real Postgres (PGlite, lib/test/pglite.ts)
// with every migration applied: cancelling and editing a pending request,
// who may do either, request limits after a cancel, and an approval
// Sonarr/Radarr couldn't take ("Couldn't add") with its Retry. Sonarr,
// Radarr, TMDb and the notification channels are mocked out.

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", async () => (await import("@/lib/test/pglite")).testDatabase());
vi.mock("@/lib/cache/revalidate", () => ({ revalidatePathSafely: () => undefined }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/notifications/fan-out", () => ({ fanOut: vi.fn(async () => undefined) }));
vi.mock("@/lib/notifications/bus", () => ({ publishNotification: () => undefined }));
vi.mock("@/lib/push/deliver", () => ({ pushToUser: async () => 0, pushMessageFor: () => ({}) }));
vi.mock("@/lib/requests/blocklist", () => ({ findBlock: async () => null, blockedMessage: () => "" }));
vi.mock("@/lib/tmdb/cache", () => ({
  getOrFetchTitle: async (mediaType: string, tmdbId: number) => ({
    mediaType,
    tmdbId,
    name: mediaType === "tv" ? "Severance" : "Dune",
    posterPath: null,
    tvdbId: mediaType === "tv" ? 371980 : null,
    rawTmdb: {
      seasons: [
        { season_number: 1, name: "Season 1", episode_count: 9 },
        { season_number: 2, name: "Season 2", episode_count: 10 },
        { season_number: 3, name: "Season 3", episode_count: 10 },
      ],
    },
  }),
}));
const library = vi.hoisted(() => ({
  getSonarrSeasonStates: vi.fn(async () => null as null | { seasonNumber: number; monitored: boolean; complete: boolean }[]),
  getTitleLibraryStatus: vi.fn(async () => ({ status: "untracked" as string, configured: true, file: null, provider: null })),
}));
vi.mock("@/lib/integrations/status", () => library);
const fourK = vi.hoisted(() => ({
  isFourKReady: vi.fn(async () => true),
  getFourKStatus: vi.fn(async () => ({ configured: true, status: "untracked" })),
}));
vi.mock("@/lib/arr/fourk", () => fourK);
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

type AddResult =
  | { ok: true; placement: Record<string, unknown> }
  | { ok: false; code: string; error: string };
const placement = {
  serverId: null,
  serverName: "Radarr",
  qualityProfileId: 4,
  rootFolderPath: "/movies",
  tags: [],
  seriesType: null,
};
const arr = vi.hoisted(() => ({
  addMovieToRadarrForUser: vi.fn(async (..._args: unknown[]): Promise<AddResult> => ({ ok: true, placement: {} })),
  addSeriesToSonarrForUser: vi.fn(async (..._args: unknown[]): Promise<AddResult> => ({ ok: true, placement: {} })),
}));
vi.mock("@/lib/arr/title-actions", () => arr);

import { resetTestDatabase, testDatabase } from "@/lib/test/pglite";
import { notifications, requests, users } from "@/lib/db/schema";
import {
  approveRequest,
  cancelRequest,
  createRequest,
  editRequest,
  rejectRequest,
  retryRequest,
} from "@/lib/requests/mutate";
import { getQuota } from "@/lib/requests/quota";
import { getFailedRequestCount, getReviewedRequests } from "@/lib/requests/query";
import { getRequestEditOptions } from "@/lib/requests/edit-options";
import { notifyReviewersOfRequest } from "@/lib/requests/alerts";

async function db() {
  return (await testDatabase()).db;
}

let admin: string;
let trusted: string;
let anna: string;
let ben: string;

async function addUser(username: string, role: "admin" | "trusted" | "member", extra: Partial<typeof users.$inferInsert> = {}) {
  const [row] = await (await db()).insert(users).values({ username, role, ...extra }).returning({ id: users.id });
  return row.id;
}

async function pendingRequest(userId: string, input: Partial<typeof requests.$inferInsert> = {}) {
  const [row] = await (await db())
    .insert(requests)
    .values({ requestedByUserId: userId, mediaType: "movie", tmdbId: 438631, title: "Dune", ...input })
    .returning();
  return row;
}

async function requestRow(id: string) {
  const [row] = await (await db()).select().from(requests).where(eq(requests.id, id));
  return row;
}

const viewer = (userId: string) => ({ userId, isAdmin: false, libraryOwnerId: admin });

beforeEach(async () => {
  await resetTestDatabase();
  vi.clearAllMocks();
  arr.addMovieToRadarrForUser.mockImplementation(async () => ({ ok: true, placement }));
  arr.addSeriesToSonarrForUser.mockImplementation(async () => ({ ok: true, placement: { ...placement, serverName: "Sonarr" } }));
  admin = await addUser("admin", "admin");
  trusted = await addUser("trusted", "trusted");
  anna = await addUser("anna", "member", { movieQuotaLimit: 1, movieQuotaDays: 7 });
  ben = await addUser("ben", "member");
});

describe("cancelling a request", () => {
  it("removes your own pending request, frees its slot, and clears the reviewers' alerts", async () => {
    const created = await createRequest(viewer(anna), { mediaType: "movie", tmdbId: 438631, title: "Dune", posterPath: null });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect((await getQuota(anna, "movie"))?.remaining).toBe(0);
    const second = await createRequest(viewer(anna), { mediaType: "movie", tmdbId: 603, title: "The Matrix", posterPath: null });
    expect(second).toMatchObject({ ok: false, code: "rate_limited" });

    const alerts = await (await db()).select().from(notifications).where(eq(notifications.requestId, created.requestId));
    expect(alerts.length).toBe(2); // the admin and the trusted member
    expect(alerts.every((a) => !a.read)).toBe(true);

    expect(await cancelRequest({ userId: anna, role: "member" }, created.requestId)).toEqual({ ok: true });
    expect(await requestRow(created.requestId)).toBeUndefined();
    expect((await getQuota(anna, "movie"))?.remaining).toBe(1);
    const cleared = await (await db()).select().from(notifications).where(eq(notifications.eventType, "request_created"));
    expect(cleared.every((a) => a.read)).toBe(true);

    const again = await createRequest(viewer(anna), { mediaType: "movie", tmdbId: 603, title: "The Matrix", posterPath: null });
    expect(again.ok).toBe(true);
  });

  it("lets only one of two requests sent at once into the last slot, and a cancel frees it", async () => {
    const both = await Promise.all([
      createRequest(viewer(anna), { mediaType: "movie", tmdbId: 438631, title: "Dune", posterPath: null }),
      createRequest(viewer(anna), { mediaType: "movie", tmdbId: 603, title: "The Matrix", posterPath: null }),
    ]);
    expect(both.filter((r) => r.ok).length).toBe(1);
    const kept = both.find((r) => r.ok);
    if (!kept?.ok) return;
    const [cancelled, next] = await Promise.all([
      cancelRequest({ userId: anna, role: "member" }, kept.requestId),
      createRequest(viewer(anna), { mediaType: "movie", tmdbId: 78, title: "Blade Runner", posterPath: null }),
    ]);
    expect(cancelled).toEqual({ ok: true });
    // Whichever ran first, the limit held: at most one request counts.
    expect((await getQuota(anna, "movie"))!.used).toBe(next.ok ? 1 : 0);
  });

  it("never touches someone else's request or one that's been reviewed", async () => {
    const bens = await pendingRequest(ben);
    expect(await cancelRequest({ userId: anna, role: "member" }, bens.id)).toMatchObject({ ok: false, code: "not_found" });
    // A reviewer declines instead.
    expect(await cancelRequest({ userId: trusted, role: "trusted" }, bens.id)).toMatchObject({ ok: false, code: "forbidden" });
    expect(await requestRow(bens.id)).toBeDefined();

    const approved = await pendingRequest(anna, { status: "approved", tmdbId: 1 });
    expect(await cancelRequest({ userId: anna, role: "member" }, approved.id)).toMatchObject({ ok: false, code: "conflict" });
    expect((await requestRow(approved.id)).status).toBe("approved");
  });
});

describe("editing a pending request", () => {
  it("lets the requester change the seasons, and refreshes the reviewers' alert", async () => {
    const show = await pendingRequest(anna, { mediaType: "tv", tmdbId: 95396, title: "Severance", seasons: [1] });
    await notifyReviewersOfRequest(show.id);
    expect(await editRequest({ userId: anna, role: "member" }, show.id, { seasons: [2, 3, 2] })).toEqual({ ok: true });
    const row = await requestRow(show.id);
    expect(row.seasons).toEqual([2, 3]);
    expect(row.editedAt).not.toBeNull();
    const [alert] = await (await db()).select().from(notifications).where(eq(notifications.requestId, show.id));
    expect(alert.message).toBe(`anna requested "Severance" (Seasons 2–3)`);
  });

  it("drops seasons Sonarr already has, and refuses seasons TMDb doesn't list", async () => {
    const show = await pendingRequest(anna, { mediaType: "tv", tmdbId: 95396, title: "Severance", seasons: [1] });
    library.getSonarrSeasonStates.mockResolvedValueOnce([{ seasonNumber: 2, monitored: true, complete: false }]);
    expect(await editRequest({ userId: anna, role: "member" }, show.id, { seasons: [2, 3] })).toEqual({ ok: true });
    expect((await requestRow(show.id)).seasons).toEqual([3]);
    expect(await editRequest({ userId: anna, role: "member" }, show.id, { seasons: [7] })).toMatchObject({
      ok: false,
      code: "invalid",
      error: "Season 7 isn't listed for this show.",
    });
  });

  it("switches to 4K as the whole title, and back", async () => {
    const show = await pendingRequest(anna, { mediaType: "tv", tmdbId: 95396, title: "Severance", seasons: [1] });
    expect(await editRequest({ userId: anna, role: "member" }, show.id, { is4k: true })).toEqual({ ok: true });
    expect(await requestRow(show.id)).toMatchObject({ is4k: true, seasons: null });
    expect(await editRequest({ userId: anna, role: "member" }, show.id, { is4k: true, seasons: [1] })).toMatchObject({
      ok: false,
      code: "invalid",
    });
    expect(await editRequest({ userId: anna, role: "member" }, show.id, { is4k: false, seasons: [2] })).toEqual({ ok: true });
    expect(await requestRow(show.id)).toMatchObject({ is4k: false, seasons: [2] });
  });

  it("refuses 4K when it isn't set up, or when there's already a 4K request", async () => {
    const movie = await pendingRequest(anna);
    fourK.isFourKReady.mockResolvedValueOnce(false);
    expect(await editRequest({ userId: anna, role: "member" }, movie.id, { is4k: true })).toMatchObject({ code: "conflict" });
    await pendingRequest(anna, { is4k: true });
    expect(await editRequest({ userId: anna, role: "member" }, movie.id, { is4k: true })).toMatchObject({ code: "conflict" });
    expect((await requestRow(movie.id)).is4k).toBe(false);
  });

  it("lets a reviewer change anyone's, but a member only their own, and only while pending", async () => {
    const bens = await pendingRequest(ben, { mediaType: "tv", tmdbId: 95396, title: "Severance", seasons: [1] });
    expect(await editRequest({ userId: anna, role: "member" }, bens.id, { seasons: [2] })).toMatchObject({ code: "not_found" });
    expect(await getRequestEditOptions({ userId: anna, role: "member" }, bens.id)).toMatchObject({ code: "not_found" });
    expect(await editRequest({ userId: trusted, role: "trusted" }, bens.id, { seasons: [2] })).toEqual({ ok: true });
    expect((await requestRow(bens.id)).seasons).toEqual([2]);

    const options = await getRequestEditOptions({ userId: admin, role: "admin" }, bens.id);
    expect(options.ok && options.options.seasonRows.map((r) => [r.seasonNumber, r.state])).toEqual([
      [3, "requestable"],
      [2, "requestable"],
      [1, "requestable"],
    ]);

    await (await db()).update(requests).set({ status: "approved" }).where(eq(requests.id, bens.id));
    expect(await editRequest({ userId: ben, role: "member" }, bens.id, { seasons: [3] })).toMatchObject({ code: "conflict" });
  });
});

describe("an approval Sonarr/Radarr can't take", () => {
  it("stays approved under Couldn't add, and Retry adds it and tells the requester", async () => {
    const movie = await pendingRequest(anna);
    arr.addMovieToRadarrForUser.mockResolvedValueOnce({ ok: false, code: "upstream", error: "Couldn't add this movie to Radarr." });
    const result = await approveRequest(movie.id, admin, { qualityProfileId: 6 });
    expect(result).toMatchObject({ ok: false, code: "upstream", addFailed: true });
    const failed = await requestRow(movie.id);
    expect(failed).toMatchObject({ status: "approved", addError: "Couldn't add this movie to Radarr.", addOverrides: { qualityProfileId: 6 } });
    expect(failed.addFailedAt).not.toBeNull();
    expect(await getFailedRequestCount()).toBe(1);
    const [listed] = await getReviewedRequests();
    expect(listed.id).toBe(movie.id);
    // Not told it's approved until it really is.
    const told = await (await db()).select().from(notifications).where(eq(notifications.userId, anna));
    expect(told).toEqual([]);
    // Nor can it be cancelled or changed now.
    expect(await cancelRequest({ userId: anna, role: "member" }, movie.id)).toMatchObject({ code: "conflict" });

    // Still unreachable: the error is kept, fresh.
    arr.addMovieToRadarrForUser.mockResolvedValueOnce({ ok: false, code: "upstream", error: "Still down." });
    expect(await retryRequest(movie.id, trusted)).toMatchObject({ ok: false, error: "Still down." });
    expect((await requestRow(movie.id)).addError).toBe("Still down.");

    expect(await retryRequest(movie.id, trusted)).toEqual({ ok: true });
    // Retried with the picks it was approved with.
    expect(arr.addMovieToRadarrForUser).toHaveBeenLastCalledWith(admin, 438631, false, { qualityProfileId: 6 });
    const done = await requestRow(movie.id);
    expect(done).toMatchObject({ status: "approved", addFailedAt: null, addError: null, arrServerName: "Radarr" });
    const [approvedNote] = await (await db()).select().from(notifications).where(eq(notifications.userId, anna));
    expect(approvedNote.eventType).toBe("request_approved");
    expect(await getFailedRequestCount()).toBe(0);
    expect(await retryRequest(movie.id, admin)).toMatchObject({ code: "not_found" });
  });

  it("goes back to the queue for anything else, as before", async () => {
    const movie = await pendingRequest(anna);
    arr.addMovieToRadarrForUser.mockResolvedValueOnce({ ok: false, code: "conflict", error: "Connect Radarr in Settings first." });
    expect(await approveRequest(movie.id, admin)).toMatchObject({ ok: false, code: "conflict" });
    expect(await requestRow(movie.id)).toMatchObject({ status: "pending", reviewedAt: null, addFailedAt: null });
  });

  it("can still be declined from Couldn't add", async () => {
    const movie = await pendingRequest(anna);
    arr.addMovieToRadarrForUser.mockResolvedValueOnce({ ok: false, code: "upstream", error: "Down." });
    await approveRequest(movie.id, admin);
    expect(await rejectRequest(movie.id, admin, "Not enough space")).toEqual({ ok: true });
    expect(await requestRow(movie.id)).toMatchObject({ status: "rejected", addFailedAt: null });
  });

  it("tells the reviewers when an automatic approval couldn't be added", async () => {
    const auto = await addUser("carl", "member", { autoApproveMovies: true });
    arr.addMovieToRadarrForUser.mockResolvedValueOnce({ ok: false, code: "upstream", error: "Couldn't add this movie to Radarr." });
    const created = await createRequest(viewer(auto), { mediaType: "movie", tmdbId: 438631, title: "Dune", posterPath: null });
    expect(created.ok).toBe(true);
    const alerts = await (await db()).select().from(notifications).where(eq(notifications.eventType, "request_created"));
    expect(alerts.map((a) => a.userId).sort()).toEqual([admin, trusted].sort());
    expect(alerts[0].message).toContain("couldn't be added: Couldn't add this movie to Radarr.");
  });
});
