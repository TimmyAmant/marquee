import { beforeEach, describe, expect, it, vi } from "vitest";

// The Plex library sync against a real Postgres (PGlite): a show Plex lists
// with no episode files mustn't be stored (it would read as Owned), one
// stored by an earlier sync goes once its files are gone, and a show whose
// episodes couldn't be listed stays. Plex's API and TMDb are mocked out.

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", async () => (await import("@/lib/test/pglite")).testDatabase());
const api = vi.hoisted(() => ({
  /** Episode files per show: [all of them, specials left out]. A show
   * that isn't in here fails to list its episodes. */
  episodes: new Map<string, [number, number]>(),
}));
vi.mock("@/lib/plex/client", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/plex/client")>();
  const item = (ratingKey: string, type: string, tmdb: number) => ({
    ratingKey,
    type,
    title: ratingKey,
    addedAt: 1_700_000_000,
    Guid: [{ id: `tmdb://${tmdb}` }],
  });
  return {
    ...real,
    getResources: async () => [
      {
        name: "Plex",
        clientIdentifier: "machine",
        provides: "server",
        connections: [{ uri: "http://plex", local: true, relay: false }],
      },
    ],
    getLibrarySections: async () => [
      { key: "movies", type: "movie", title: "Movies" },
      { key: "shows", type: "show", title: "TV" },
    ],
    getSectionItems: async (_uri: string, _token: string, section: string) =>
      section === "movies"
        ? [item("film", "movie", 4)]
        : [item("full", "show", 1), item("empty", "show", 2), item("specials", "show", 3)],
    getShowFileInfo: async (_uri: string, _token: string, ratingKey: string) => {
      const counts = api.episodes.get(ratingKey);
      if (!counts) throw new Error("down");
      return { ...real.emptyShowFileInfo(), episodeCount: counts[0], episodesHave: counts[1] };
    },
    getMediaDetailsByRatingKeys: async () => new Map(),
  };
});
vi.mock("@/lib/integrations/credentials", () => ({
  getPlexCredential: async () => ({ authToken: "token", clientId: "client" }),
  IntegrationDisconnectedError: class extends Error {},
}));
vi.mock("@/lib/tmdb/cache", () => ({ getOrFetchTitle: async () => undefined }));
vi.mock("@/lib/tmdb/cross-reference", () => ({ resolveTmdbIdFromTvdbId: async () => null }));
vi.mock("@/lib/library/title-overrides", () => ({ applyTmdbIdOverride: async (_u: string, _t: string, id: number) => id }));

import { resetTestDatabase, testDatabase } from "@/lib/test/pglite";
import { plexLibraryItems, users } from "@/lib/db/schema";
import { syncPlexLibrary } from "@/lib/plex/sync";

let userId: string;

beforeEach(async () => {
  await resetTestDatabase();
  const { db } = await testDatabase();
  const [u] = await db.insert(users).values({ username: "admin", role: "admin", permissions: [] }).returning();
  userId = u.id;
  api.episodes = new Map([
    ["full", [12, 10]],
    ["empty", [0, 0]],
    ["specials", [2, 0]],
  ]);
});

/** What's stored: each item's rating key and its episode files (all of
 * them, then specials left out). */
async function stored() {
  const { db } = await testDatabase();
  const rows = await db
    .select({ key: plexLibraryItems.ratingKey, count: plexLibraryItems.episodeCount, have: plexLibraryItems.episodesHave })
    .from(plexLibraryItems);
  return rows.map((r) => [r.key, r.count, r.have] as const).sort(([a], [b]) => a.localeCompare(b));
}

describe("the Plex sync", () => {
  it("leaves out a show with no episode files, and keeps a movie and a show with only specials", async () => {
    await syncPlexLibrary(userId);
    expect(await stored()).toEqual([
      ["film", null, null],
      ["full", 12, 10],
      ["specials", 2, 0],
    ]);
  });

  it("drops a show stored earlier once its files are gone", async () => {
    api.episodes.set("empty", [3, 3]);
    await syncPlexLibrary(userId);
    expect((await stored()).map(([key]) => key)).toEqual(["empty", "film", "full", "specials"]);
    api.episodes.set("empty", [0, 0]);
    await syncPlexLibrary(userId);
    expect((await stored()).map(([key]) => key)).toEqual(["film", "full", "specials"]);
  });

  it("keeps a show, with no episode count, when its episodes can't be listed", async () => {
    api.episodes.delete("empty");
    await syncPlexLibrary(userId);
    expect(await stored()).toEqual([
      ["empty", null, null],
      ["film", null, null],
      ["full", 12, 10],
      ["specials", 2, 0],
    ]);
  });
});
