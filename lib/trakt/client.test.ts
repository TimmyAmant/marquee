import { describe, it, expect } from "vitest";
import { getTraktItems, getTraktItemsPage, parseTraktUrl } from "./client";

describe("parseTraktUrl", () => {
  it("parses a list URL", () => {
    expect(parseTraktUrl("https://trakt.tv/users/someone/lists/best-of-2024")).toEqual({
      kind: "list",
      username: "someone",
      slug: "best-of-2024",
    });
  });

  it("parses a watchlist URL", () => {
    expect(parseTraktUrl("https://trakt.tv/users/someone/watchlist")).toEqual({
      kind: "watchlist",
      username: "someone",
    });
  });

  it("rejects a non-trakt.tv host", () => {
    expect(parseTraktUrl("https://evil.com/users/someone/watchlist")).toBeNull();
  });

  it("rejects a malformed URL", () => {
    expect(parseTraktUrl("not a url")).toBeNull();
  });

  it("rejects a trakt.tv URL that isn't a users/list or users/watchlist path", () => {
    expect(parseTraktUrl("https://trakt.tv/movies/inception")).toBeNull();
  });

  it("rejects a lists URL with no slug", () => {
    expect(parseTraktUrl("https://trakt.tv/users/someone/lists")).toBeNull();
  });

  it("does not accept a lookalike host like trakt.tv.evil.com", () => {
    expect(parseTraktUrl("https://trakt.tv.evil.com/users/someone/watchlist")).toBeNull();
  });
});

describe("parseTraktUrl hardening", () => {
  it("only takes http(s) links on trakt.tv, with no port or sign-in in them", () => {
    expect(parseTraktUrl("https://www.trakt.tv/users/someone/watchlist")).toEqual({ kind: "watchlist", username: "someone" });
    expect(parseTraktUrl("ftp://trakt.tv/users/someone/watchlist")).toBeNull();
    expect(parseTraktUrl("https://trakt.tv:444/users/someone/watchlist")).toBeNull();
    expect(parseTraktUrl("https://me:pw@trakt.tv/users/someone/watchlist")).toBeNull();
  });

  it("refuses usernames and slugs that aren't plain URL segments", () => {
    expect(parseTraktUrl("https://trakt.tv/users/../watchlist")).toBeNull();
    expect(parseTraktUrl("https://trakt.tv/users/a%2Fb/watchlist")).toBeNull();
    expect(parseTraktUrl("https://trakt.tv/users/someone/lists/%2E%2E")).toBeNull();
    expect(parseTraktUrl("https://trakt.tv/users/some%20one/watchlist")).toBeNull();
    expect(parseTraktUrl("https://trakt.tv/users/some.one_2/lists/my-list")).toEqual({
      kind: "list",
      username: "some.one_2",
      slug: "my-list",
    });
  });
});

describe("the Trakt client", () => {
  it("only ever calls api.trakt.tv, never following a redirect", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response("[]", { headers: { "x-pagination-page-count": "3", "x-pagination-item-count": "90" } });
    }) as typeof fetch;
    try {
      const page = await getTraktItemsPage({ clientId: "id" }, { kind: "list", username: "some.one", slug: "best" }, 2, 40);
      expect(page).toEqual({ items: [], pageCount: 3, itemCount: 90 });
      await getTraktItems({ clientId: "id" }, { kind: "watchlist", username: "someone" });
    } finally {
      globalThis.fetch = original;
    }
    expect(calls.map((c) => c.url)).toEqual([
      "https://api.trakt.tv/users/some.one/lists/best/items/movies,shows?page=2&limit=40",
      "https://api.trakt.tv/users/someone/watchlist/movies,shows",
    ]);
    expect(calls.every((c) => c.init.redirect === "error")).toBe(true);
  });
});
