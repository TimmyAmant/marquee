import { beforeEach, describe, expect, it, vi } from "vitest";

// "Remove from Radarr/Sonarr" against a real Postgres (PGlite): the title
// comes off every server that has it, its approved requests are marked
// removed (and stop counting as open) with the admin's reason, their
// requesters are told, and nothing is marked when no server took it.
// Radarr/Sonarr and the notification channels are mocked out.

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", async () => (await import("@/lib/test/pglite")).testDatabase());
vi.mock("@/lib/cache/revalidate", () => ({ revalidatePathSafely: () => undefined }));
const copies = vi.hoisted(() => ({ findLibraryCopies: vi.fn() }));
vi.mock("@/lib/integrations/status", () => copies);
vi.mock("@/lib/arr/fourk", () => ({ fourKCopies: async () => [] }));
const radarr = vi.hoisted(() => ({ deleteMovie: vi.fn(async (..._args: unknown[]) => undefined) }));
vi.mock("@/lib/radarr/client", () => radarr);
vi.mock("@/lib/sonarr/client", () => ({ deleteSeries: vi.fn() }));
vi.mock("@/lib/notifications/fan-out", () => ({ fanOut: vi.fn(async () => undefined) }));
vi.mock("@/lib/notifications/bus", () => ({ publishNotification: () => undefined }));
vi.mock("@/lib/push/deliver", () => ({ pushToUser: async () => 0, pushMessageFor: () => ({}) }));

import { eq } from "drizzle-orm";
import { resetTestDatabase, testDatabase } from "@/lib/test/pglite";
import { notifications, requests, users } from "@/lib/db/schema";
import { removeTitleFromArr } from "@/lib/arr/remove";
import { getActiveRequestStatus } from "@/lib/requests/query";

const server = (name: string) => ({ server: { name, baseUrl: "http://radarr", apiKey: "k", kind: "radarr" }, arrId: 7, monitored: true });

let anna: string;
let admin: string;

beforeEach(async () => {
  await resetTestDatabase();
  vi.clearAllMocks();
  const { db } = await testDatabase();
  const [a] = await db.insert(users).values({ username: "admin", role: "admin", permissions: [] }).returning();
  const [m] = await db.insert(users).values({ username: "anna", role: "member", permissions: [] }).returning();
  admin = a.id;
  anna = m.id;
  await db.insert(requests).values([
    { requestedByUserId: anna, mediaType: "movie", tmdbId: 438631, title: "Dune", status: "approved" },
    { requestedByUserId: anna, mediaType: "movie", tmdbId: 438631, title: "Dune", status: "approved", is4k: true },
  ]);
});

describe("removing a title from Radarr", () => {
  it("deletes it (with its files when asked) and marks its approved requests removed", async () => {
    copies.findLibraryCopies.mockResolvedValue([server("Radarr")]);
    expect(await getActiveRequestStatus(anna, "movie", 438631)).toBe("approved");

    const result = await removeTitleFromArr(admin, "movie", 438631, null, { deleteFiles: true, fourK: false });

    expect(result).toMatchObject({ ok: true, removedFrom: ["Radarr"], failed: [], requestsMarked: 1 });
    expect(radarr.deleteMovie).toHaveBeenCalledWith({ baseUrl: "http://radarr", apiKey: "k" }, 7, true);
    // The regular request is no longer open; the 4K one is untouched.
    expect(await getActiveRequestStatus(anna, "movie", 438631)).toBeNull();
    expect(await getActiveRequestStatus(anna, "movie", 438631, true)).toBe("approved");
    const { db } = await testDatabase();
    const [row] = await db.select().from(requests).where(eq(requests.is4k, false));
    expect(row.removedAt).not.toBeNull();
    expect(row.removedReason).toBeNull();
    expect(row.notFoundDismissedAt).not.toBeNull();
    const told = await db.select().from(notifications).where(eq(notifications.userId, anna));
    expect(told).toMatchObject([{ eventType: "request_removed", message: "\"Dune\" was removed from the server." }]);
  });

  it("keeps the admin's reason and tells each requester, but not the admin about their own", async () => {
    copies.findLibraryCopies.mockResolvedValue([server("Radarr")]);
    const { db } = await testDatabase();
    await db.insert(requests).values({ requestedByUserId: admin, mediaType: "movie", tmdbId: 438631, title: "Dune", status: "approved" });

    const result = await removeTitleFromArr(admin, "movie", 438631, null, {
      deleteFiles: false,
      fourK: false,
      reason: "Couldn't find a good copy of it",
    });

    expect(result).toMatchObject({ ok: true, requestsMarked: 2 });
    const rows = await db.select().from(requests).where(eq(requests.is4k, false));
    expect(rows.map((r) => r.removedReason)).toEqual(["Couldn't find a good copy of it", "Couldn't find a good copy of it"]);
    const told = await db.select().from(notifications);
    expect(told).toMatchObject([
      { userId: anna, eventType: "request_removed", message: "\"Dune\" was removed from the server: Couldn't find a good copy of it" },
    ]);
  });

  it("says so when it isn't tracked, or no server took the delete", async () => {
    copies.findLibraryCopies.mockResolvedValue([]);
    expect(await removeTitleFromArr(admin, "movie", 438631, null, { deleteFiles: false, fourK: false })).toMatchObject({
      ok: false,
      code: "conflict",
    });

    copies.findLibraryCopies.mockResolvedValue([server("Radarr")]);
    radarr.deleteMovie.mockRejectedValueOnce(new Error("offline"));
    expect(await removeTitleFromArr(admin, "movie", 438631, null, { deleteFiles: false, fourK: false })).toMatchObject({
      ok: false,
      code: "upstream",
    });
    expect(await getActiveRequestStatus(anna, "movie", 438631)).toBe("approved");
  });
});
