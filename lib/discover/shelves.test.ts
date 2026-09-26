import { describe, expect, it } from "vitest";
import {
  applyLayoutOrder,
  defaultLayout,
  defaultShelfTitle,
  describeShelf,
  moveShelf,
  parseStoredSource,
  parseTmdbListId,
  resolveLayout,
  validateShelfInput,
  type ShelfRow,
} from "./shelves";
import { DISCOVER_SHELF_KEYS } from "./lists";
import { interleaveByPopularity } from "./merge";

const row = (over: Partial<ShelfRow>): ShelfRow => ({
  id: "00000000-0000-4000-8000-000000000000",
  builtIn: null,
  kind: "keyword",
  title: null,
  source: null,
  position: 0,
  hidden: false,
  ...over,
});

describe("the default layout", () => {
  it("is today's Discover exactly: every built-in row, in page order, shown", () => {
    const layout = resolveLayout([]);
    expect(layout).toEqual(defaultLayout());
    expect(layout.map((s) => s.id)).toEqual([...DISCOVER_SHELF_KEYS]);
    expect(layout.map((s) => s.title)).toEqual([
      "Recently Added",
      "Trending",
      "Popular Movies",
      "Movie Genres",
      "Upcoming Movies",
      "Studios",
      "Popular Series",
      "Series Genres",
      "Upcoming Series",
      "Networks",
    ]);
    expect(layout.every((s) => !s.hidden && !s.custom)).toBe(true);
  });
});

describe("resolveLayout", () => {
  it("follows the stored order and visibility, custom rows included", () => {
    const layout = resolveLayout([
      row({ id: "a", builtIn: "networks", kind: "networks", position: 0, hidden: true }),
      row({
        id: "11111111-1111-4111-8111-111111111111",
        kind: "keyword",
        title: "Anime",
        source: { tmdbId: 210024, name: "anime", mediaType: "all" },
        position: 1,
      }),
      ...DISCOVER_SHELF_KEYS.filter((k) => k !== "networks").map((key, i) =>
        row({ id: `b${i}`, builtIn: key, kind: key, position: 2 + i }),
      ),
    ]);
    expect(layout[0]).toMatchObject({ id: "networks", hidden: true, custom: false, title: "Networks" });
    expect(layout[1]).toMatchObject({
      id: "11111111-1111-4111-8111-111111111111",
      custom: true,
      title: "Anime",
      source: { mediaType: "all", tmdbId: 210024, name: "anime", url: null },
    });
    expect(layout).toHaveLength(DISCOVER_SHELF_KEYS.length + 1);
  });

  it("adds a built-in row with no stored row at the end, and drops rows for built-ins it doesn't know", () => {
    const layout = resolveLayout([
      row({ id: "a", builtIn: "trending", kind: "trending", position: 0 }),
      row({ id: "b", builtIn: "someFutureRow", kind: "someFutureRow", position: 1 }),
    ]);
    expect(layout.map((s) => s.id)).toEqual(["trending", ...DISCOVER_SHELF_KEYS.filter((k) => k !== "trending")]);
  });

  it("keeps a custom row of an unknown kind, with no source, so it can be removed", () => {
    const [first] = resolveLayout([row({ id: "22222222-2222-4222-8222-222222222222", kind: "fromTheFuture", title: "Mystery", position: 0 })]);
    expect(first).toMatchObject({ custom: true, kind: "fromTheFuture", title: "Mystery", source: null });
  });
});

describe("applyLayoutOrder", () => {
  const current = resolveLayout([]);

  it("takes the new order and visibility; rows left out follow in their order", () => {
    const result = applyLayoutOrder(current, [{ id: "networks", hidden: true }, { id: "trending" }]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.slice(0, 3)).toEqual([
      { id: "networks", hidden: true },
      { id: "trending", hidden: false },
      { id: "recentlyAdded", hidden: false },
    ]);
    expect(result.value).toHaveLength(current.length);
  });

  it("refuses unknown ids, repeats, bad values and an empty list", () => {
    expect(applyLayoutOrder(current, [{ id: "nope" }])).toMatchObject({ ok: false });
    expect(applyLayoutOrder(current, [{ id: "trending" }, { id: "trending" }])).toMatchObject({ ok: false });
    expect(applyLayoutOrder(current, [{ id: "trending", hidden: "yes" }])).toMatchObject({ ok: false });
    expect(applyLayoutOrder(current, [])).toMatchObject({ ok: false });
    expect(applyLayoutOrder(current, "trending")).toMatchObject({ ok: false });
  });
});

describe("validateShelfInput", () => {
  it("builds each kind's source, with sensible default names", () => {
    expect(validateShelfInput({ kind: "keyword", tmdbId: 210024, name: "anime" })).toEqual({
      ok: true,
      value: { kind: "keyword", title: "Anime", source: { mediaType: "all", tmdbId: 210024, name: "anime", url: null } },
    });
    expect(validateShelfInput({ kind: "genre", tmdbId: "28", name: "Action", mediaType: "movie" })).toMatchObject({
      ok: true,
      value: { title: "Action Movies", source: { tmdbId: 28, mediaType: "movie" } },
    });
    expect(validateShelfInput({ kind: "company", tmdbId: 41077, name: "A24", mediaType: "movie", title: "  A24 films " })).toMatchObject({
      ok: true,
      value: { title: "A24 films", source: { tmdbId: 41077, mediaType: "movie" } },
    });
    expect(validateShelfInput({ kind: "network", tmdbId: 213, mediaType: "movie" })).toMatchObject({
      ok: true,
      value: { title: "Network", source: { mediaType: "tv" } },
    });
    expect(validateShelfInput({ kind: "tmdbList", url: "https://www.themoviedb.org/list/8136-star-wars" })).toMatchObject({
      ok: true,
      value: { source: { tmdbId: 8136 } },
    });
    expect(validateShelfInput({ kind: "traktList", url: "https://trakt.tv/users/Someone/lists/best-of-2024?sort=rank" })).toEqual({
      ok: true,
      value: {
        kind: "traktList",
        title: "Best of 2024",
        source: { mediaType: "all", tmdbId: null, name: null, url: "https://trakt.tv/users/Someone/lists/best-of-2024" },
      },
    });
    expect(validateShelfInput({ kind: "library", mediaType: "tv" })).toMatchObject({
      ok: true,
      value: { title: "Recently Added Series", source: { mediaType: "tv", tmdbId: null } },
    });
  });

  it("refuses bad kinds, ids, media types, titles and links", () => {
    expect(validateShelfInput({ kind: "person", tmdbId: 1 })).toMatchObject({ ok: false });
    expect(validateShelfInput({ kind: "keyword" })).toMatchObject({ ok: false, error: "Pick a keyword." });
    expect(validateShelfInput({ kind: "keyword", tmdbId: -3 })).toMatchObject({ ok: false });
    expect(validateShelfInput({ kind: "keyword", tmdbId: 1.5 })).toMatchObject({ ok: false });
    expect(validateShelfInput({ kind: "genre", tmdbId: 28, mediaType: "all" })).toMatchObject({ ok: false });
    expect(validateShelfInput({ kind: "library", mediaType: "books" })).toMatchObject({ ok: false });
    expect(validateShelfInput({ kind: "keyword", tmdbId: 1, title: "x".repeat(61) })).toMatchObject({ ok: false });
    expect(validateShelfInput({ kind: "keyword", tmdbId: 1, title: 42 })).toMatchObject({ ok: false });
    expect(validateShelfInput({ kind: "tmdbList", url: "https://evil.example/list/8136" })).toMatchObject({ ok: false });
    // Only trakt.tv links: the server reads Trakt's API, never the link.
    for (const url of [
      "https://evil.example/users/a/lists/b",
      "https://trakt.tv.evil.example/users/a/lists/b",
      "http://localhost/users/a/lists/b",
      "javascript:alert(1)",
      "https://trakt.tv/users/a%2F..%2Fb/lists/c",
    ]) {
      expect(validateShelfInput({ kind: "traktList", url }), url).toMatchObject({ ok: false });
    }
  });

  it("reads a stored source back, and nothing for one it can't", () => {
    expect(parseStoredSource("keyword", { tmdbId: 5, name: "x", mediaType: "movie" })).toEqual({
      mediaType: "movie",
      tmdbId: 5,
      name: "x",
      url: null,
    });
    expect(parseStoredSource("keyword", { tmdbId: "nope" })).toBeNull();
    expect(parseStoredSource("unknown", {})).toBeNull();
  });
});

describe("helpers", () => {
  it("parses TMDb list numbers and links", () => {
    expect(parseTmdbListId(8136)).toBe(8136);
    expect(parseTmdbListId(" 8136 ")).toBe(8136);
    expect(parseTmdbListId("https://www.themoviedb.org/list/8136-the-entire-star-wars-collection")).toBe(8136);
    expect(parseTmdbListId("https://www.themoviedb.org/fr-FR/list/8136")).toBe(8136);
    expect(parseTmdbListId("https://example.com/list/8136")).toBeNull();
    expect(parseTmdbListId("list")).toBeNull();
  });

  it("moves a row one place, and not past either end", () => {
    expect(moveShelf(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
    expect(moveShelf(["a", "b", "c"], 1, 1)).toEqual(["a", "c", "b"]);
    expect(moveShelf(["a", "b", "c"], 0, -1)).toEqual(["a", "b", "c"]);
    expect(moveShelf(["a", "b", "c"], 2, 1)).toEqual(["a", "b", "c"]);
  });

  it("describes a row for the settings list", () => {
    expect(describeShelf({ kind: "trending", custom: false, source: null })).toBe("Built in");
    expect(
      describeShelf({ kind: "company", custom: true, source: { mediaType: "movie", tmdbId: 41077, name: "A24", url: null } }),
    ).toBe("Studio · A24 · Movies");
    expect(defaultShelfTitle("traktList", { mediaType: "all", tmdbId: null, name: null, url: "https://trakt.tv/users/bob/watchlist" })).toBe(
      "bob's watchlist",
    );
  });

  it("mixes movies and series by popularity, dropping repeats", () => {
    const movies = [
      { mediaType: "movie", tmdbId: 1, popularity: 50 },
      { mediaType: "movie", tmdbId: 2, popularity: 10 },
    ];
    const series = [
      { mediaType: "tv", tmdbId: 1, popularity: 30 },
      { mediaType: "tv", tmdbId: 1, popularity: 30 },
    ];
    expect(interleaveByPopularity([movies, series]).map((i) => `${i.mediaType}${i.tmdbId}`)).toEqual(["movie1", "tv1", "movie2"]);
  });
});
