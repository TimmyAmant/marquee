import { beforeEach, describe, expect, it, vi } from "vitest";

// "Open in Radarr/Sonarr" (viewer.arrLinks) through the real
// GET /titles/{type}/{id}/status route: the admin and anyone who may review
// requests get the links; any other member gets none — and their servers
// aren't even asked. Everything under the route is stubbed; the database
// throws if touched.

vi.mock("server-only", () => ({}));
vi.mock("@/auth", () => ({ auth: async () => null, signIn: async () => undefined, signOut: async () => undefined, handlers: {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined, unstable_cache: (fn: unknown) => fn }));
vi.mock("@/lib/db/client", () => ({
  db: new Proxy(
    {},
    {
      get() {
        throw new Error("the database was touched");
      },
    },
  ),
}));

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const MEMBER_ID = "33333333-3333-4333-8333-333333333333";
const who = vi.hoisted(() => ({ role: "member" as string, permissions: [] as string[] }));
const LINK = { kind: "radarr" as const, serverName: "Radarr", is4k: false, url: "https://radarr.example.com/movie/603" };
const getArrLinks = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/token-store", () => ({
  authenticateApiToken: async () => ({
    tokenId: "t",
    tokenName: "test",
    expiresAt: new Date("2030-01-01"),
    user: {
      id: who.role === "admin" ? ADMIN_ID : MEMBER_ID,
      username: who.role,
      displayName: null,
      role: who.role,
      autoApproveMovies: false,
      autoApproveTv: false,
      permissions: who.permissions,
      avatarUpdatedAt: null,
      createdAt: new Date("2026-01-01"),
    },
  }),
}));
vi.mock("@/lib/integrations/library-owner", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getLibraryOwnerUserId: async () => ADMIN_ID,
}));
vi.mock("@/lib/users/access", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getAccess: async () => ({ role: who.role, permissions: who.permissions }),
}));
vi.mock("@/lib/api/guards", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  requireTmdbConfigured: async () => undefined,
}));
vi.mock("@/lib/tmdb/cache", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getOrFetchTitle: async () => ({ mediaType: "movie", tmdbId: 603, tvdbId: null, name: "The Matrix", rawTmdb: null }),
}));
vi.mock("@/lib/integrations/status", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getTitleLibraryStatus: async () => ({ status: "owned", provider: "radarr", configured: true, file: null }),
  getArrTrackingInfo: async () => ({ arrId: 1, monitored: true }),
  getSonarrSeasonStates: async () => null,
}));
vi.mock("@/lib/integrations/credentials", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getArrCredential: async () => null,
}));
vi.mock("@/lib/favorites/query", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  isFavorited: async () => false,
}));
vi.mock("@/lib/requests/query", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getActiveRequestStatus: async () => null,
  getOtherPendingRequesters: async () => [],
  getViewerTitleRequests: async () => [],
  getViewerRequestsForTitle: async () => [],
}));
vi.mock("@/lib/arr/fourk", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getFourKStatus: async () => null,
}));
vi.mock("@/lib/issues", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getOpenIssuesFor: async () => 0,
}));
vi.mock("@/lib/requests/blocklist", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  findBlock: async () => null,
}));
vi.mock("@/lib/requests/not-found", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getTitleNotFoundSince: async () => null,
}));
vi.mock("@/lib/arr/title-links", () => ({ getArrLinks }));

import { GET } from "@/app/api/v1/titles/[type]/[id]/status/route";

async function statusAs(role: string, permissions: string[]) {
  who.role = role;
  who.permissions = permissions;
  const response = await GET(
    new Request("http://marquee.test/api/v1/titles/movie/603/status", {
      headers: { authorization: `Bearer mqt_${"m".repeat(43)}` },
    }),
    { params: Promise.resolve({ type: "movie", id: "603" }) },
  );
  expect(response.status).toBe(200);
  return (await response.json()) as { viewer: { arrLinks?: unknown[] } };
}

describe("viewer.arrLinks", () => {
  beforeEach(() => {
    getArrLinks.mockReset();
    getArrLinks.mockResolvedValue([LINK]);
  });

  it("goes to the admin, from the library owner's servers", async () => {
    const body = await statusAs("admin", []);
    expect(body.viewer.arrLinks).toEqual([LINK]);
    expect(getArrLinks).toHaveBeenCalledWith(ADMIN_ID, "movie", 603, null);
  });

  it("goes to a member who may review requests", async () => {
    const body = await statusAs("member", ["requestMovies", "reviewRequests"]);
    expect(body.viewer.arrLinks).toEqual([LINK]);
  });

  it("never goes to a member without it — their servers aren't even asked", async () => {
    const body = await statusAs("member", ["requestMovies", "requestTv", "viewRequests", "advancedRequests", "manageIssues"]);
    expect(body.viewer.arrLinks).toEqual([]);
    expect(getArrLinks).not.toHaveBeenCalled();
  });

  it("is empty, not an error, when a server can't be asked", async () => {
    getArrLinks.mockRejectedValue(new Error("down"));
    const body = await statusAs("admin", []);
    expect(body.viewer.arrLinks).toEqual([]);
  });
});
