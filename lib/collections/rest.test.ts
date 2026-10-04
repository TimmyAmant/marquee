import { beforeEach, describe, expect, it, vi } from "vitest";

// "The rest of the collection" (lib/collections/rest.ts): after a movie is
// added or requested, which of its collection-mates are offered, what "Add
// them too" does for the admin and a member, and the /api/v1 route — with
// the database, TMDb, Radarr and createRequest mocked out.

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", () => ({ db: {} }));
vi.mock("@/lib/cache/revalidate", () => ({ revalidatePathSafely: () => undefined }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const TRUSTED_ID = "22222222-2222-4222-8222-222222222222";
const MEMBER_ID = "33333333-3333-4333-8333-333333333333";

const tokens: Record<string, { id: string; role: "admin" | "trusted" | "member" }> = {
  ["mqt_" + "a".repeat(43)]: { id: ADMIN_ID, role: "admin" },
  ["mqt_" + "t".repeat(43)]: { id: TRUSTED_ID, role: "trusted" },
  ["mqt_" + "m".repeat(43)]: { id: MEMBER_ID, role: "member" },
};

vi.mock("@/lib/api/token-store", () => ({
  authenticateApiToken: async (token: string) => {
    const user = tokens[token];
    if (!user) return null;
    return {
      tokenId: "t",
      tokenName: "test",
      expiresAt: new Date("2030-01-01"),
      user: {
        id: user.id,
        username: user.role,
        displayName: null,
        role: user.role,
        autoApproveMovies: false,
        autoApproveTv: false,
        permissions: presets[user.role],
        avatarUpdatedAt: null,
        createdAt: new Date(),
      },
    };
  },
}));
vi.mock("@/lib/integrations/library-owner", () => ({ getLibraryOwnerUserId: async () => ADMIN_ID }));
const presets = vi.hoisted(() => ({
  admin: [] as string[],
  trusted: [
    "requestMovies", "requestTv", "request4kMovies", "request4kTv", "autoApproveMovies", "autoApproveTv",
    "autoApprove4kMovies", "autoApprove4kTv", "advancedRequests", "viewRequests", "reviewRequests", "manageIssues",
    "reportIssues", "bypassLimits",
  ],
  member: ["requestMovies", "requestTv", "request4kMovies", "request4kTv", "reportIssues"],
}));
const access = vi.hoisted(() => ({
  getAccess: vi.fn(async (id: string) =>
    id === "33333333-3333-4333-8333-333333333333"
      ? { role: "member", permissions: presets.member }
      : id === "22222222-2222-4222-8222-222222222222"
        ? { role: "trusted", permissions: presets.trusted }
        : { role: "admin", permissions: [] },
  ),
}));
vi.mock("@/lib/users/access", () => access);
vi.mock("@/lib/auth/get-admin", () => ({ getAdminUserId: async () => ADMIN_ID }));

vi.mock("@/lib/tmdb/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/tmdb/client")>()),
  isTmdbConfigured: async () => true,
}));
vi.mock("@/lib/tmdb/cache", () => ({
  getOrFetchTitle: async (mediaType: string, tmdbId: number) => ({
    mediaType,
    tmdbId,
    name: "Ice Age",
    rawTmdb: tmdbId === 1 ? {} : { belongs_to_collection: { id: 8354, name: "Ice Age Collection" } },
  }),
}));

// Ice Age Collection: 425 is owned, 950 already requested by this viewer,
// 8355 on the blocklist; 57800 and 278154 are what's left to request.
const collection = [
  { mediaType: "movie" as const, tmdbId: 425, name: "Ice Age", posterPath: "/a.jpg", year: "2002" },
  { mediaType: "movie" as const, tmdbId: 950, name: "Ice Age: The Meltdown", posterPath: "/b.jpg", year: "2006" },
  { mediaType: "movie" as const, tmdbId: 8355, name: "Ice Age: Dawn of the Dinosaurs", posterPath: "/c.jpg", year: "2009" },
  { mediaType: "movie" as const, tmdbId: 57800, name: "Ice Age: Continental Drift", posterPath: "/d.jpg", year: "2012" },
  { mediaType: "movie" as const, tmdbId: 278154, name: "Ice Age: Collision Course", posterPath: "/e.jpg", year: "2016" },
];
const franchise = vi.hoisted(() => ({
  loadFranchise: vi.fn(),
}));
vi.mock("@/lib/pages/title", () => franchise);
const blocklist = vi.hoisted(() => ({ getBlockedTitleKeys: vi.fn(async () => new Set(["movie:8355"])) }));
vi.mock("@/lib/requests/blocklist", () => blocklist);

type CreateResult = { ok: true; requestId: string } | { ok: false; code: string; error: string };
const mutate = vi.hoisted(() => ({
  createRequest: vi.fn(
    async (_viewer: unknown, input: { tmdbId: number }): Promise<CreateResult> => ({ ok: true, requestId: `req-${input.tmdbId}` }),
  ),
}));
vi.mock("@/lib/requests/mutate", () => mutate);
const alerts = vi.hoisted(() => ({ notifyReviewersOfCollection: vi.fn(async () => undefined) }));
vi.mock("@/lib/requests/alerts", () => alerts);

const arr = vi.hoisted(() => ({
  addTitleToLibrary: vi.fn(async (..._args: unknown[]): Promise<{ ok: true } | { ok: false; code: string; error: string }> => ({ ok: true })),
}));
vi.mock("@/lib/arr/title-actions", () => arr);
vi.mock("@/lib/integrations/credentials", () => ({
  getArrCredential: async () => ({ baseUrl: "http://radarr", apiKey: "k" }),
  isArrFullyConfigured: () => true,
}));

import { addCollectionRest, collectionRest } from "@/lib/collections/rest";
import * as route from "@/app/api/v1/titles/[type]/[id]/collection-rest/route";

const member = { userId: MEMBER_ID, isAdmin: false, libraryOwnerId: ADMIN_ID };
const admin = { userId: ADMIN_ID, isAdmin: true, libraryOwnerId: ADMIN_ID };

function franchiseData() {
  return {
    franchiseTitle: "Ice Age Collection",
    franchiseItems: collection,
    collectionId: 8354,
    franchiseStatusMap: new Map([["movie:425", "owned"]]),
    franchiseRequestStatusMap: new Map([["movie:950", "pending"]]),
    franchiseFavoritedIds: new Set<number>(),
    collectionFavorited: false,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  franchise.loadFranchise.mockResolvedValue(franchiseData());
  mutate.createRequest.mockImplementation(async (_viewer, input) => ({ ok: true, requestId: `req-${input.tmdbId}` }));
  arr.addTitleToLibrary.mockImplementation(async () => ({ ok: true }));
});

describe("collectionRest", () => {
  it("offers a member what they could request, less the movie they just asked for", async () => {
    // Just requested 57800: only 278154 is left (425 owned, 950 already
    // requested, 8355 blocked).
    const rest = await collectionRest(member, 57800);
    expect(rest).toMatchObject({ collectionId: 8354, name: "Ice Age Collection", action: "request" });
    expect(rest?.items.map((i) => i.tmdbId)).toEqual([278154]);
  });

  it("offers the admin everything the library doesn't have, less the movie they just added", async () => {
    const rest = await collectionRest(admin, 950);
    expect(rest?.action).toBe("add");
    expect(rest?.items.map((i) => i.tmdbId)).toEqual([8355, 57800, 278154]);
  });

  it("is null for a movie in no collection, or with nothing left", async () => {
    expect(await collectionRest(member, 1)).toBeNull();
    franchise.loadFranchise.mockResolvedValue({
      ...franchiseData(),
      franchiseStatusMap: new Map(collection.map((c) => [`movie:${c.tmdbId}`, "owned"])),
    });
    expect(await collectionRest(admin, 425)).toBeNull();
  });
});

describe("addCollectionRest", () => {
  it("adds the rest to Radarr for the admin, one by one", async () => {
    arr.addTitleToLibrary.mockImplementation(async (...args: unknown[]) =>
      args[2] === 8355 ? { ok: false, code: "upstream", error: "Radarr said no." } : { ok: true },
    );
    expect(await addCollectionRest(admin, 950)).toEqual({
      ok: true,
      action: "add",
      total: 3,
      done: 2,
      failed: [{ tmdbId: 8355, title: "Ice Age: Dawn of the Dinosaurs", error: "Radarr said no." }],
      message: "Added 2 of 3 — 1 failed",
    });
    expect(arr.addTitleToLibrary.mock.calls.map((c) => c[2])).toEqual([8355, 57800, 278154]);
  });

  it("requests the rest for a member, but not the movie itself", async () => {
    franchise.loadFranchise.mockResolvedValue({ ...franchiseData(), franchiseRequestStatusMap: new Map() });
    const result = await addCollectionRest(member, 950);
    expect(result).toMatchObject({ ok: true, action: "request", total: 2, done: 2, message: "Requested all 2." });
    expect(mutate.createRequest.mock.calls.map((c) => c[1].tmdbId)).toEqual([57800, 278154]);
    expect(arr.addTitleToLibrary).not.toHaveBeenCalled();
  });
});

const MEMBER = "mqt_" + "m".repeat(43);

function call(method: "GET" | "POST", params = { type: "movie", id: "57800" }) {
  const request = new Request(`http://marquee.local:3000/api/v1/titles/${params.type}/${params.id}/collection-rest`, {
    method,
    headers: { authorization: `Bearer ${MEMBER}`, host: "marquee.local:3000" },
  });
  return (method === "GET" ? route.GET : route.POST)(request, { params: Promise.resolve(params) });
}

describe("/titles/{type}/{id}/collection-rest", () => {
  it("GET lists the rest as title cards", async () => {
    const res = await call("GET");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ collection: { id: 8354, name: "Ice Age Collection" }, action: "request" });
    expect(body.items).toEqual([expect.objectContaining({ tmdbId: 278154, name: "Ice Age: Collision Course", canRequest: true })]);
  });

  it("GET answers collection null for a series", async () => {
    const res = await call("GET", { type: "tv", id: "1399" });
    expect(await res.json()).toEqual({ collection: null, action: "request", items: [] });
  });

  it("POST requests the rest", async () => {
    const res = await call("POST");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, action: "request", total: 1, done: 1, failed: [] });
  });

  it("POST is 404 for a series", async () => {
    expect((await call("POST", { type: "tv", id: "1399" })).status).toBe(404);
  });
});
