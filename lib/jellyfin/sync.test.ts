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
import { syncJellyfinLibrary } from "@/lib/jellyfin/sync";

let userId: string;

const series = (id: string, tmdb: string) => ({ Id: id, Type: "Series", Name: id, ProviderIds: { Tmdb: tmdb } });
const movie = (id: string, tmdb: string) => ({ Id: id, Type: "Movie", Name: id, ProviderIds: { Tmdb: tmdb } });

beforeEach(async () => {
  await resetTestDatabase();
  const { db } = await testDatabase();
  const [u] = await db.insert(users).values({ username: "admin", role: "admin", permissions: [] }).returning();
  userId = u.id;
  api.items = [series("full", "1"), series("empty", "2"), series("specials", "3"), movie("film", "4")];
  api.episodes = new Map([["full", 10]]);
  api.withFiles = new Set(["full", "specials"]);
});

/** What's stored: each item's id and the episodes it has (specials left out). */
async function stored() {
  const { db } = await testDatabase();
  const rows = await db
    .select({ id: jellyfinLibraryItems.itemId, have: jellyfinLibraryItems.episodesHave })
    .from(jellyfinLibraryItems);
  return rows.map((r) => [r.id, r.have] as const).sort(([a], [b]) => a.localeCompare(b));
}

describe("the Jellyfin sync", () => {
  it("leaves out a show with no episode files, and keeps a movie and a show with only specials", async () => {
    await syncJellyfinLibrary(userId);
    expect(await stored()).toEqual([["film", null], ["full", 10], ["specials", 0]]);
  });

  it("drops a show stored earlier once its files are gone", async () => {
    api.episodes = new Map([["full", 10], ["empty", 3]]);
    api.withFiles = new Set(["full", "empty", "specials"]);
    await syncJellyfinLibrary(userId);
    expect(await stored()).toEqual([["empty", 3], ["film", null], ["full", 10], ["specials", 0]]);
    api.episodes = new Map([["full", 10]]);
    api.withFiles = new Set(["full", "specials"]);
    await syncJellyfinLibrary(userId);
    expect(await stored()).toEqual([["film", null], ["full", 10], ["specials", 0]]);
  });

  it("keeps every show, with no episode count, when the episode listing fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    api.episodes = null;
    await syncJellyfinLibrary(userId);
    expect(await stored()).toEqual([["empty", null], ["film", null], ["full", null], ["specials", null]]);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});
