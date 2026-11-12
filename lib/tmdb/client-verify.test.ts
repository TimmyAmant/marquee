import { afterEach, describe, expect, it, vi } from "vitest";

// Checking a TMDb key from Settings › General has a timeout, like every
// other TMDb call, so a TMDb that never answers can't hang the save.

vi.mock("server-only", () => ({}));
vi.mock("@/auth", () => ({ auth: async () => null }));
vi.mock("@/lib/integrations/app-settings", () => ({
  getTmdbAccessToken: async () => null,
  getStoredDiscoverLocale: async () => ({ streamingRegion: "US", discoverRegion: null, discoverLanguage: null }),
}));

import { verifyTmdbAccessToken } from "@/lib/tmdb/client";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("verifyTmdbAccessToken", () => {
  it("sends a v3 key as api_key, with a timeout", async () => {
    const fetchMock = vi.fn(async (_url: URL, _init: RequestInit) => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await verifyTmdbAccessToken("0123456789abcdef0123456789abcdef")).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url.searchParams.get("api_key")).toBe("0123456789abcdef0123456789abcdef");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});
