import { describe, expect, it } from "vitest";
import { parseWatchlist, fetchWatchlist } from "./watchlist-api";

describe("parseWatchlist", () => {
  it("reads movies and shows with their TMDB ids", () => {
    const body = {
      MediaContainer: {
        size: 3,
        totalSize: 3,
        Metadata: [
          {
            ratingKey: "5d776be17a53e9001e732ab9",
            type: "movie",
            title: "Dune: Part Two",
            year: 2024,
            Guid: [{ id: "imdb://tt15239678" }, { id: "tmdb://693134" }, { id: "tvdb://347006" }],
          },
          {
            ratingKey: "5d9c086c46115600200aa2fe",
            type: "show",
            title: "Severance",
            year: 2022,
            Guid: [{ id: "imdb://tt11280740" }, { id: "tmdb://95396" }, { id: "tvdb://371980" }],
          },
          { ratingKey: "x", type: "movie", title: "No ids", Guid: [{ id: "imdb://tt0000001" }] },
        ],
      },
    };
    expect(parseWatchlist(body)).toEqual([
      { mediaType: "movie", tmdbId: 693134, title: "Dune: Part Two" },
      { mediaType: "tv", tmdbId: 95396, title: "Severance" },
    ]);
  });

  it("leaves out what can't be requested and survives junk", () => {
    const body = {
      MediaContainer: {
        Metadata: [
          { type: "episode", title: "Pilot", Guid: [{ id: "tmdb://1" }] },
          { type: "movie", title: "Bad id", Guid: [{ id: "tmdb://abc" }, { id: "tmdb://0" }] },
          { type: "movie", Guid: [{ id: "tmdb://42" }] },
          null,
          "nope",
        ],
      },
    };
    expect(parseWatchlist(body)).toEqual([{ mediaType: "movie", tmdbId: 42, title: "Untitled" }]);
    expect(parseWatchlist({ MediaContainer: { size: 0 } })).toEqual([]);
    expect(parseWatchlist("<html>")).toEqual([]);
    expect(parseWatchlist(null)).toEqual([]);
  });
});

describe("fetchWatchlist paging", () => {
  const page = (start: number, count: number, total: number) => ({
    MediaContainer: {
      totalSize: total,
      Metadata: Array.from({ length: count }, (_, i) => ({
        type: "movie",
        title: `M${start + i}`,
        Guid: [{ id: `tmdb://${start + i + 1}` }],
      })),
    },
  });

  it("reads every page, and sends only an ETag saved from a whole read", async () => {
    const calls: { url: string; etag: string | null }[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      const start = Number(new URL(url).searchParams.get("X-Plex-Container-Start"));
      calls.push({ url, etag: (init?.headers as Record<string, string>)["If-None-Match"] ?? null });
      return new Response(JSON.stringify(page(start, Math.min(100, 230 - start), 230)), {
        headers: { "content-type": "application/json", etag: start === 0 ? '"abc"' : '"x"' },
      });
    }) as typeof fetch;
    try {
      const old = await fetchWatchlist("client", "token", '"abc"');
      expect(old.status).toBe("ok");
      expect(calls[0].etag).toBeNull();
      expect(old.status === "ok" && old.items.length).toBe(230);
      expect(old.status === "ok" && old.etag).toBe('all:"abc"');
      expect(calls).toHaveLength(3);
      calls.length = 0;
      await fetchWatchlist("client", "token", 'all:"abc"');
      expect(calls[0].etag).toBe('"abc"');
    } finally {
      globalThis.fetch = original;
    }
  });
});
