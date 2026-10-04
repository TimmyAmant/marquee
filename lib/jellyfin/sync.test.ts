import { beforeEach, describe, expect, it, vi } from "vitest";

// The Jellyfin library sync against a real Postgres (PGlite): a show whose
// folder is empty is listed by Jellyfin all the same, and mustn't be stored
// (it would read as Owned). Jellyfin's API and TMDb are mocked out.

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", async () => (await import("@/lib/test/pglite")).testDatabase());
const api = vi.hoisted(() => ({
  items: [] as { Id: string; Type: string; Name: string; ProviderIds?: Record<string, string> }[],
  episodes: null as Map<string, number> | null,
  withFiles: null as Set<string> | null,
}));
vi.mock("@/lib/jellyfin/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/jellyfin/client")>()),
  testConnection: async () => ({ Id: "srv", ServerName: "Jellyfin", ProductName: "Jellyfin Server" }),
  getLibraryItems: async () => api.items,
  getEpisodeFileCountsBySeries: async () => {
    if (!api.episodes || !api.withFiles) throw new Error("down");
    return { counts: api.episodes, withFiles: api.withFiles };
  },
}));
vi.mock("@/lib/integrations/credentials", () => ({
  getJellyfinCredential: async () => ({ baseUrl: "http://jf", apiKey: "k", userId: "u" }),
  assertStillConnected: async () => undefined,
}));
vi.mock("@/lib/tmdb/cache", () => ({ getOrFetchTitle: async () => undefined }));
vi.mock("@/lib/tmdb/cross-reference", () => ({ resolveTmdbIdFromTvdbId: async () => null }));
vi.mock("@/lib/library/title-overrides", () => ({ applyTmdbIdOverride: async (_u: string, _t: string, id: number) => id }));

import { resetTestDatabase, testDatabase } from "@/lib/test/pglite";
import { jellyfinLibraryItems, users } from "@/lib/db/schema";
import { seriesWithEpisodeFiles } from "@/lib/jellyfin/client";
import { syncJellyfinLibrary } from "@/lib/jellyfin/sync";

let userId: string;

const series = (id: string, tmdb: string) => ({ Id: id, Type: "Series", Name: id, ProviderIds: { Tmdb: tmdb } });

beforeEach(async () => {
  await resetTestDatabase();
  const { db } = await testDatabase();
  const [u] = await db.insert(users).values({ username: "admin", role: "admin", permissions: [] }).returning();
  userId = u.id;
  api.items = [series("full", "1"), series("empty", "2"), series("specials", "3")];
  api.episodes = new Map([["full", 10]]);
  api.withFiles = new Set(["full", "specials"]);
});

async function storedIds() {
  const { db } = await testDatabase();
  return (await db.select({ id: jellyfinLibraryItems.itemId }).from(jellyfinLibraryItems)).map((r) => r.id).sort();
}

describe("the Jellyfin sync", () => {
  it("leaves out a show with no episode files, and keeps one with only specials", async () => {
    await syncJellyfinLibrary(userId);
    expect(await storedIds()).toEqual(["full", "specials"]);
  });

  it("drops a show stored earlier once its files are gone", async () => {
    api.withFiles = new Set(["full", "empty", "specials"]);
    await syncJellyfinLibrary(userId);
    expect(await storedIds()).toEqual(["empty", "full", "specials"]);
    api.withFiles = new Set(["full", "specials"]);
    await syncJellyfinLibrary(userId);
    expect(await storedIds()).toEqual(["full", "specials"]);
  });

  it("keeps every show when the episode listing fails", async () => {
    api.episodes = null;
    await syncJellyfinLibrary(userId);
    expect(await storedIds()).toEqual(["empty", "full", "specials"]);
  });
});

describe("seriesWithEpisodeFiles", () => {
  it("counts specials, not episodes Jellyfin only knows from metadata", () => {
    expect([
      ...seriesWithEpisodeFiles([
        { SeriesId: "a", ParentIndexNumber: 0 },
        { SeriesId: "b", ParentIndexNumber: 1, LocationType: "Virtual" },
        { ParentIndexNumber: 1 },
      ]),
    ]).toEqual(["a"]);
  });
});
