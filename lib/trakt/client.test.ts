import { describe, it, expect } from "vitest";
import { parseTraktUrl } from "./client";

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
