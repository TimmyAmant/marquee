import { beforeEach, describe, expect, it, vi } from "vitest";

// "Remove from Radarr/Sonarr" against a real Postgres (PGlite): the title
// comes off every server that has it, its approved requests are marked
// removed (and stop counting as open), and nothing is marked when no server
// took it. Radarr/Sonarr are mocked out.

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", async () => (await import("@/lib/test/pglite")).testDatabase());
vi.mock("@/lib/cache/revalidate", () => ({ revalidatePathSafely: () => undefined }));
const copies = vi.hoisted(() => ({ findLibraryCopies: vi.fn() }));
vi.mock("@/lib/integrations/status", () => copies);
vi.mock("@/lib/arr/fourk", () => ({ fourKCopies: async () => [] }));
const radarr = vi.hoisted(() => ({ deleteMovie: vi.fn(async (..._args: unknown[]) => undefined) }));
vi.mock("@/lib/radarr/client", () => radarr);
vi.mock("@/lib/sonarr/client", () => ({ deleteSeries: vi.fn() }));

import { eq } from "drizzle-orm";
import { resetTestDatabase, testDatabase } from "@/lib/test/pglite";
import { requests, users } from "@/lib/db/schema";
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
    expect(row.notFoundDismissedAt).not.toBeNull();
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
