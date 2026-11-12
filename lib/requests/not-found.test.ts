import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

// The not-found-check job against a real Postgres (PGlite,
// lib/test/pglite.ts): two checks racing over the same request — a
// scheduled run and a Run now — still alert the reviewers only once.
// Radarr, Plex, Jellyfin and the notification channels are mocked out.

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", async () => (await import("@/lib/test/pglite")).testDatabase());
vi.mock("@/lib/notifications/fan-out", () => ({ fanOut: async () => undefined }));
vi.mock("@/lib/notifications/bus", () => ({ publishNotification: () => undefined }));
vi.mock("@/lib/push/deliver", () => ({ pushToUser: async () => 0, pushMessageFor: () => ({}) }));
vi.mock("@/lib/tmdb/cache", () => ({ getOrFetchTitle: async () => ({ releaseDate: "2021-10-22" }) }));
vi.mock("@/lib/arr/servers", () => {
  const server = { id: "radarr", kind: "radarr", name: "Radarr", baseUrl: "http://radarr", apiKey: "k" };
  return {
    arrConfig: (s: unknown) => s,
    getArrServerById: async () => server,
    getDefaultArrServer: async () => server,
  };
});
vi.mock("@/lib/radarr/client", () => ({
  getMovieByTmdbId: async () => ({
    id: 1,
    tmdbId: 438631,
    titleSlug: "dune",
    status: "released",
    monitored: true,
    hasFile: false,
  }),
  getQueueSummaries: async () => new Map(),
}));
vi.mock("@/lib/plex/sync", () => ({ getPlexFileInfo: async () => null }));
vi.mock("@/lib/jellyfin/sync", () => ({ getJellyfinFileInfo: async () => null }));

import { resetTestDatabase, testDatabase } from "@/lib/test/pglite";
import { notifications, requests, users } from "@/lib/db/schema";
import { presetPermissions } from "@/lib/users/permissions";
import { checkNotFoundRequests } from "@/lib/requests/not-found";

async function db() {
  return (await testDatabase()).db;
}

let admin: string;

beforeEach(async () => {
  await resetTestDatabase();
  const [row] = await (await db())
    .insert(users)
    .values({ username: "admin", role: "admin", permissions: presetPermissions("member") })
    .returning({ id: users.id });
  admin = row.id;
});

describe("checkNotFoundRequests", () => {
  it("alerts once when two checks race over the same request", async () => {
    const [request] = await (await db())
      .insert(requests)
      .values({
        requestedByUserId: admin,
        mediaType: "movie",
        tmdbId: 438631,
        title: "Dune",
        status: "approved",
        reviewedAt: new Date(Date.now() - 3 * 24 * 3_600_000),
      })
      .returning();

    await Promise.all([checkNotFoundRequests(), checkNotFoundRequests()]);

    const alerts = await (await db()).select().from(notifications).where(eq(notifications.userId, admin));
    expect(alerts.filter((n) => n.eventType === "request_not_found")).toHaveLength(1);
    const [after] = await (await db()).select().from(requests).where(eq(requests.id, request.id));
    expect(after.notFoundAlerts).toBe(1);
    expect(after.notFoundSince).not.toBeNull();
  });
});
