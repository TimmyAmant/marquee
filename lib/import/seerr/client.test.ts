import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchSeerrBlocklist, seerrGet, seerrGetAll, seerrUrlError, SeerrApiError } from "@/lib/import/seerr/client";

// The Seerr client: what addresses it accepts, and that it never follows
// a redirect, sends the key only as a header, and pages listings.

describe("seerrUrlError", () => {
  it("takes a plain http(s) address, on the home network too", () => {
    expect(seerrUrlError("http://192.168.1.20:5055")).toBeNull();
    expect(seerrUrlError("http://seerr.local:5055/")).toBeNull();
    expect(seerrUrlError("https://requests.example.com/api/v1")).toBeNull();
    expect(seerrUrlError("http://localhost:5055")).toBeNull();
  });

  it("refuses anything else", () => {
    expect(seerrUrlError("")).toBe("Enter a full URL, starting with https:// or http://.");
    expect(seerrUrlError("seerr.local:5055")).toBe("Enter a full URL, starting with https:// or http://.");
    expect(seerrUrlError("ftp://seerr.local")).toBe("Enter a full URL, starting with https:// or http://.");
    expect(seerrUrlError("http://admin:secret@seerr.local:5055")).toBe("Leave the user name and password out of the URL.");
    expect(seerrUrlError(`http://seerr.local/${"a".repeat(2100)}`)).toBe("That URL is too long.");
  });
});

type Call = { url: string; init: RequestInit };

function mockFetch(handler: (url: URL, init: RequestInit) => Response | Promise<Response>) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: URL | string, init: RequestInit) => {
      const url = input instanceof URL ? input : new URL(String(input));
      calls.push({ url: url.toString(), init });
      return handler(url, init);
    }),
  );
  return calls;
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const connection = { baseUrl: "http://seerr.local:5055", apiKey: "k-secret" };

afterEach(() => vi.unstubAllGlobals());

describe("seerrGet", () => {
  it("sends the key as a header only and never follows redirects", async () => {
    const calls = mockFetch(() => json({ version: "3.4.1" }));
    await expect(seerrGet(connection, "/status")).resolves.toEqual({ version: "3.4.1" });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("http://seerr.local:5055/api/v1/status");
    expect(calls[0].url).not.toContain("k-secret");
    expect((calls[0].init.headers as Record<string, string>)["X-Api-Key"]).toBe("k-secret");
    expect(calls[0].init.redirect).toBe("manual");
    expect(calls[0].init.signal).toBeInstanceOf(AbortSignal);
  });

  it("treats a redirect or an error status as a Seerr error with that status", async () => {
    mockFetch(() => new Response(null, { status: 302, headers: { location: "http://elsewhere.example/" } }));
    await expect(seerrGet(connection, "/status")).rejects.toMatchObject({ name: "SeerrApiError", status: 302 });
    mockFetch(() => json({ message: "nope" }, 403));
    const error = (await seerrGet(connection, "/user").catch((e: unknown) => e)) as SeerrApiError;
    expect(error).toBeInstanceOf(SeerrApiError);
    expect(error.status).toBe(403);
  });

  it("refuses an answer that isn't JSON", async () => {
    mockFetch(() => new Response("<html>", { status: 200 }));
    await expect(seerrGet(connection, "/status")).rejects.toThrow("didn't answer JSON");
  });
});

describe("seerrGetAll", () => {
  it("walks the pages with take/skip until the last one", async () => {
    const calls = mockFetch((url) => {
      const skip = Number(url.searchParams.get("skip"));
      const all = Array.from({ length: 205 }, (_, i) => ({ id: i + 1 }));
      return json({ pageInfo: { pages: 3, pageSize: 100, results: 205, page: skip / 100 + 1 }, results: all.slice(skip, skip + 100) });
    });
    const items = await seerrGetAll<{ id: number }>(connection, "/request", { filter: "all" });
    expect(items).toHaveLength(205);
    expect(items[204]).toEqual({ id: 205 });
    expect(calls.map((c) => new URL(c.url).searchParams.get("skip"))).toEqual(["0", "100", "200"]);
    expect(new URL(calls[0].url).searchParams.get("filter")).toBe("all");
  });

  it("stops after a short page", async () => {
    const calls = mockFetch(() => json({ results: [{ id: 1 }] }));
    await expect(seerrGetAll(connection, "/issue")).resolves.toHaveLength(1);
    expect(calls).toHaveLength(1);
  });
});

describe("fetchSeerrBlocklist", () => {
  it("falls back from /blocklist to Jellyseerr's /blacklist, and to nothing on Overseerr", async () => {
    mockFetch((url) => (url.pathname.endsWith("/blacklist") ? json({ results: [{ id: 1, tmdbId: 8392, mediaType: "movie" }] }) : json({}, 404)));
    await expect(fetchSeerrBlocklist(connection)).resolves.toEqual([{ id: 1, tmdbId: 8392, mediaType: "movie" }]);
    mockFetch(() => json({}, 404));
    await expect(fetchSeerrBlocklist(connection)).resolves.toEqual([]);
    mockFetch(() => json({}, 500));
    await expect(fetchSeerrBlocklist(connection)).rejects.toBeInstanceOf(SeerrApiError);
  });
});
