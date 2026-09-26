import { beforeEach, describe, expect, it, vi } from "vitest";

// Settings → Discover against a real Postgres (PGlite): the default layout,
// reordering and hiding, custom rows (names looked up from TMDb, mocked),
// removing, and resetting.

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", async () => (await import("@/lib/test/pglite")).testDatabase());
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
const tmdb = vi.hoisted(() => ({
  getKeywordDetails: vi.fn(async (id: number) => ({ id, name: "anime" })),
  getCompanyDetails: vi.fn(async (id: number) => ({ id, name: "A24" })),
  getNetworkDetails: vi.fn(async (id: number) => ({ id, name: "Netflix", logo_path: null })),
  getTmdbList: vi.fn(async (id: number) => ({ id, name: "The Entire Star Wars Collection", items: [] })),
  getMovieGenres: vi.fn(async () => ({ genres: [{ id: 28, name: "Action" }] })),
  getTvGenres: vi.fn(async () => ({ genres: [{ id: 16, name: "Animation" }] })),
}));
vi.mock("@/lib/tmdb/client", () => tmdb);

import { resetTestDatabase } from "@/lib/test/pglite";
import {
  createCustomShelf,
  deleteShelf,
  getCustomShelf,
  getDiscoverLayout,
  resetDiscoverLayout,
  saveDiscoverLayout,
  updateShelf,
} from "@/lib/discover/layout";
import { DISCOVER_SHELF_KEYS } from "@/lib/discover/lists";
import { MAX_CUSTOM_SHELVES } from "@/lib/discover/shelves";

beforeEach(async () => {
  await resetTestDatabase();
});

const ids = async () => (await getDiscoverLayout()).map((s) => s.id);

describe("the Discover layout", () => {
  it("starts as the built-in rows in their usual order", async () => {
    expect(await ids()).toEqual([...DISCOVER_SHELF_KEYS]);
  });

  it("saves a new order and which rows show", async () => {
    const result = await saveDiscoverLayout([{ id: "networks" }, { id: "trending", hidden: true }]);
    expect(result.ok).toBe(true);
    const layout = await getDiscoverLayout();
    expect(layout.slice(0, 3).map((s) => [s.id, s.hidden])).toEqual([
      ["networks", false],
      ["trending", true],
      ["recentlyAdded", false],
    ]);
    expect(await saveDiscoverLayout([{ id: "made-up" }])).toMatchObject({ ok: false, code: "invalid" });
  });

  it("adds custom rows at the end, named from TMDb when no name is given", async () => {
    const keyword = await createCustomShelf({ kind: "keyword", tmdbId: 210024 });
    expect(keyword).toMatchObject({ ok: true, shelf: { kind: "keyword", title: "Anime", custom: true, hidden: false } });
    const studio = await createCustomShelf({ kind: "company", tmdbId: 41077, mediaType: "movie", title: "A24 films" });
    expect(studio).toMatchObject({ ok: true, shelf: { title: "A24 films", source: { name: "A24", mediaType: "movie" } } });
    const layout = await getDiscoverLayout();
    expect(layout.map((s) => s.title).slice(-2)).toEqual(["Anime", "A24 films"]);
    expect(layout).toHaveLength(DISCOVER_SHELF_KEYS.length + 2);
    // A TMDb hiccup leaves the name out rather than failing.
    tmdb.getKeywordDetails.mockRejectedValueOnce(new Error("down"));
    expect(await createCustomShelf({ kind: "keyword", tmdbId: 5 })).toMatchObject({ ok: true, shelf: { title: "Keyword" } });
  });

  it("refuses a bad row, and more than the limit", async () => {
    expect(await createCustomShelf({ kind: "keyword" })).toMatchObject({ ok: false, code: "invalid" });
    for (let i = 0; i < MAX_CUSTOM_SHELVES; i++) {
      expect((await createCustomShelf({ kind: "library", title: `Row ${i}` })).ok).toBe(true);
    }
    expect(await createCustomShelf({ kind: "library" })).toMatchObject({ ok: false, code: "conflict" });
  });

  it("hides built-in rows, renames and repoints custom ones", async () => {
    expect(await updateShelf("studios", { hidden: true })).toMatchObject({ ok: true, shelf: { id: "studios", hidden: true } });
    expect(await updateShelf("studios", { title: "Nope" })).toMatchObject({ ok: false, code: "invalid" });
    const created = await createCustomShelf({ kind: "genre", tmdbId: 28, mediaType: "movie" });
    if (!created.ok) throw new Error("setup");
    expect(created.shelf.title).toBe("Action Movies");
    const renamed = await updateShelf(created.shelf.id, { title: "Explosions", mediaType: "tv", tmdbId: 16 });
    expect(renamed).toMatchObject({ ok: true, shelf: { title: "Explosions", source: { tmdbId: 16, name: "Animation", mediaType: "tv" } } });
    expect(await updateShelf(created.shelf.id, { mediaType: "all" })).toMatchObject({ ok: false, code: "invalid" });
    expect(await updateShelf("33333333-3333-4333-8333-333333333333", { hidden: true })).toMatchObject({ ok: false, code: "not_found" });
    // Hiding a built-in row kept the custom row where it was.
    expect((await ids()).at(-1)).toBe(created.shelf.id);
  });

  it("removes custom rows only", async () => {
    const created = await createCustomShelf({ kind: "tmdbList", url: "https://www.themoviedb.org/list/8136" });
    if (!created.ok) throw new Error("setup");
    expect(created.shelf).toMatchObject({ title: "The Entire Star Wars Collection", source: { tmdbId: 8136 } });
    expect(await deleteShelf("trending")).toMatchObject({ ok: false, code: "invalid" });
    expect(await deleteShelf(created.shelf.id)).toEqual({ ok: true });
    expect(await getCustomShelf(created.shelf.id)).toBeNull();
    expect(await deleteShelf(created.shelf.id)).toMatchObject({ ok: false, code: "not_found" });
    expect(await deleteShelf("not-a-uuid")).toMatchObject({ ok: false, code: "not_found" });
  });

  it("resets the built-in rows, keeping custom rows after them", async () => {
    const created = await createCustomShelf({ kind: "library", mediaType: "movie" });
    if (!created.ok) throw new Error("setup");
    await saveDiscoverLayout([{ id: created.shelf.id }, { id: "networks", hidden: true }]);
    expect((await ids())[0]).toBe(created.shelf.id);
    const { shelves } = await resetDiscoverLayout();
    expect(shelves.map((s) => s.id)).toEqual([...DISCOVER_SHELF_KEYS, created.shelf.id]);
    expect(shelves.every((s) => !s.hidden)).toBe(true);
  });
});
