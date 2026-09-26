import { beforeEach, describe, expect, it, vi } from "vitest";

// "Request all N missing": which titles are in the set, how each goes
// through createRequest, the batched reviewer alert, the result message —
// and the /api/v1 route and title DTO around it, with the database, TMDb and
// createRequest mocked out.

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
        avatarUpdatedAt: null,
        createdAt: new Date(),
      },
    };
  },
}));
vi.mock("@/lib/integrations/library-owner", () => ({ getLibraryOwnerUserId: async () => ADMIN_ID }));
vi.mock("@/lib/auth/get-admin", () => ({ getAdminUserId: async () => ADMIN_ID }));

vi.mock("@/lib/tmdb/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/tmdb/client")>()),
  isTmdbConfigured: async () => true,
}));
vi.mock("@/lib/tmdb/cache", () => ({
  getOrFetchTitle: async (mediaType: string, tmdbId: number) => ({ mediaType, tmdbId, name: "Ice Age", rawTmdb: {} }),
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

import { requestAllMessage, requestAllMissing } from "./request-all";
import * as route from "@/app/api/v1/titles/[type]/[id]/request-all-missing/route";
import { titleDetailDto } from "@/lib/api/title-dto";
import { franchiseRequestableItems } from "@/lib/title-meta";

const member = { userId: MEMBER_ID, isAdmin: false, libraryOwnerId: ADMIN_ID };
const LIMIT = "You've used your 2 movie requests for a week. You can ask again in 7 days.";

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
});

describe("franchiseRequestableItems", () => {
  const statusKeys = new Set(["movie:425"]);
  const requested = new Set(["movie:950"]);
  const blocked = new Set(["movie:8355"]);

  it("leaves out owned/tracked, already-requested and blocked titles", () => {
    expect(franchiseRequestableItems(collection, statusKeys, requested, blocked, false)).toEqual([
      { mediaType: "movie", tmdbId: 57800 },
      { mediaType: "movie", tmdbId: 278154 },
    ]);
  });

  it("works for a TV crossover group, once per title", () => {
    const shows = [
      { mediaType: "tv" as const, tmdbId: 1412 },
      { mediaType: "tv" as const, tmdbId: 60735 },
      { mediaType: "tv" as const, tmdbId: 60735 },
    ];
    expect(franchiseRequestableItems(shows, new Set(["tv:1412"]), undefined, undefined, false)).toEqual([
      { mediaType: "tv", tmdbId: 60735 },
    ]);
  });

  it("is empty for the admin and signed-out viewers", () => {
    expect(franchiseRequestableItems(collection, statusKeys, requested, blocked, true)).toEqual([]);
    expect(franchiseRequestableItems(collection, statusKeys, requested, blocked, undefined)).toEqual([]);
  });
});

describe("requestAllMessage", () => {
  it("says what happened", () => {
    expect(requestAllMessage(0, 0, [])).toBe("Nothing left to request here.");
    expect(requestAllMessage(1, 1, [])).toBe("Requested it.");
    expect(requestAllMessage(4, 4, [])).toBe("Requested all 4.");
    expect(requestAllMessage(4, 2, [{ error: LIMIT }, { error: LIMIT }])).toBe(`Requested 2 of 4. ${LIMIT}`);
    expect(requestAllMessage(2, 0, [{ error: LIMIT }, { error: LIMIT }])).toBe(`Couldn't request any of the 2. ${LIMIT}`);
  });

  it("gives each reason once, most common first", () => {
    const blocked = "The admin isn't taking requests for this title.";
    expect(requestAllMessage(4, 1, [{ error: blocked }, { error: LIMIT }, { error: LIMIT }])).toBe(
      `Requested 1 of 4. ${LIMIT} ${blocked}`,
    );
    expect(requestAllMessage(2, 1, [{ error: "No trailing stop" }])).toBe("Requested 1 of 2. No trailing stop.");
  });
});

describe("requestAllMissing", () => {
  it("requests each title in the set through createRequest, quietly, with one alert", async () => {
    const result = await requestAllMissing(member, "movie", 425);
    expect(result).toEqual({ ok: true, total: 2, requested: 2, refused: [], message: "Requested all 2." });
    expect(mutate.createRequest).toHaveBeenCalledTimes(2);
    expect(mutate.createRequest).toHaveBeenNthCalledWith(1, member, {
      mediaType: "movie",
      tmdbId: 57800,
      title: "Ice Age: Continental Drift",
      posterPath: "/d.jpg",
      quiet: true,
    });
    expect(alerts.notifyReviewersOfCollection).toHaveBeenCalledWith(
      MEMBER_ID,
      ["req-57800", "req-278154"],
      "Ice Age Collection",
    );
  });

  it("reports a partial result when the request limit runs out, without asking again", async () => {
    franchise.loadFranchise.mockResolvedValue({ ...franchiseData(), franchiseRequestStatusMap: new Map() });
    blocklist.getBlockedTitleKeys.mockResolvedValueOnce(new Set());
    // Room for two more movies.
    let left = 2;
    mutate.createRequest.mockImplementation(async (_viewer, input) =>
      left-- > 0 ? { ok: true, requestId: `req-${input.tmdbId}` } : { ok: false, code: "rate_limited", error: LIMIT },
    );
    const result = await requestAllMissing(member, "movie", 425);
    expect(result).toMatchObject({
      ok: true,
      total: 4,
      requested: 2,
      message: `Requested 2 of 4. ${LIMIT}`,
    });
    if (!result.ok) throw new Error("expected ok");
    expect(result.refused.map((r) => r.tmdbId)).toEqual([57800, 278154]);
    // The fourth wasn't tried once the third hit the limit.
    expect(mutate.createRequest).toHaveBeenCalledTimes(3);
    expect(alerts.notifyReviewersOfCollection).toHaveBeenCalledWith(MEMBER_ID, ["req-950", "req-8355"], "Ice Age Collection");
  });

  it("carries on past other refusals (a keyword block, say)", async () => {
    mutate.createRequest.mockImplementationOnce(async () => ({
      ok: false,
      code: "forbidden",
      error: "The admin isn't taking requests for this title.",
    }));
    const result = await requestAllMissing(member, "movie", 425);
    expect(result).toMatchObject({
      requested: 1,
      message: "Requested 1 of 2. The admin isn't taking requests for this title.",
    });
    expect(mutate.createRequest).toHaveBeenCalledTimes(2);
  });

  it("works for a trusted member too", async () => {
    const result = await requestAllMissing({ userId: TRUSTED_ID, isAdmin: false, libraryOwnerId: ADMIN_ID }, "movie", 425);
    expect(result).toMatchObject({ ok: true, requested: 2 });
  });

  it("refuses the admin, who has Add all", async () => {
    const result = await requestAllMissing({ userId: ADMIN_ID, isAdmin: true, libraryOwnerId: ADMIN_ID }, "movie", 425);
    expect(result).toMatchObject({ ok: false, code: "forbidden" });
    expect(mutate.createRequest).not.toHaveBeenCalled();
  });

  it("is 404 for a title outside any collection", async () => {
    franchise.loadFranchise.mockResolvedValue({ ...franchiseData(), franchiseTitle: null, franchiseItems: [] });
    expect(await requestAllMissing(member, "movie", 1)).toMatchObject({ ok: false, code: "not_found" });
  });
});

const MEMBER = "mqt_" + "m".repeat(43);
const ADMIN = "mqt_" + "a".repeat(43);

function post(token: string, params = { type: "movie", id: "425" }) {
  const request = new Request("http://marquee.local:3000/api/v1/titles/movie/425/request-all-missing", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, host: "marquee.local:3000" },
  });
  return route.POST(request, { params: Promise.resolve(params) });
}

describe("POST /titles/{type}/{id}/request-all-missing", () => {
  it("files the member's requests and reports how it went", async () => {
    const res = await post(MEMBER);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, total: 2, requested: 2, refused: [], message: "Requested all 2." });
  });

  it("is 200 with the refusals on a partial result", async () => {
    mutate.createRequest.mockImplementation(async (_viewer, input) =>
      input.tmdbId === 57800 ? { ok: true, requestId: "req" } : { ok: false, code: "rate_limited", error: LIMIT },
    );
    const res = await post(MEMBER);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      total: 2,
      requested: 1,
      refused: [{ mediaType: "movie", tmdbId: 278154, title: "Ice Age: Collision Course", error: LIMIT }],
      message: `Requested 1 of 2. ${LIMIT}`,
    });
  });

  it("is 403 for the admin and 404 for a bad id", async () => {
    const admin = await post(ADMIN);
    expect(admin.status).toBe(403);
    expect((await admin.json()).code).toBe("forbidden");
    expect((await post(MEMBER, { type: "movie", id: "abc" })).status).toBe(404);
  });
});

describe("the title DTO's franchise", () => {
  function pageData() {
    return {
      title: { name: "Ice Age", tvdbId: null, imdbId: null, overview: null, posterPath: null, backdropPath: null, status: null, releaseDate: null, firstAirDate: null },
      raw: null,
      year: "2002",
      titleMeta: { runtimeLabel: null, ratingPercent: null, genres: [], yearRange: null, statusLabel: null, network: null },
      titleSidebar: { releaseDateLabel: null, nextAirDateLabel: null, originalLanguageLabel: null, productionCountry: null, watchProviders: [] },
      libraryStatus: { status: "owned", configured: true, file: null },
      runtimeMinutes: null,
      nextAirDate: null,
      productionCountryCode: null,
      credits: [],
      keywords: [],
      trailer: null,
      externalIds: null,
      titleFavorited: false,
      activeRequestStatus: null,
      otherRequesters: [],
      arrConfigured: { movie: true, tv: true },
      arrTracking: null,
      seasonRequests: { states: new Map(), canRequestSeasons: false, requestedSeasons: null },
      fourK: null,
      openReports: 0,
      blocked: null,
      blockedKeys: new Set(["movie:8355"]),
      seasons: [],
      seasonCompleteness: null,
      cast: [],
      castFavoritedIds: new Set(),
      companies: [],
      companyFavoritedIds: new Set(),
      similarItems: [],
      similarStatusMap: new Map(),
      similarRequestStatusMap: new Map(),
      similarFavoritedIds: new Set(),
      ...franchiseData(),
    } as unknown as Parameters<typeof titleDetailDto>[3];
  }

  it("lists requestAllMissing for a member and addAllMissing for the admin", () => {
    const asMember = titleDetailDto("movie", 425, false, pageData()).franchise;
    expect(asMember?.requestAllMissing).toEqual([
      { mediaType: "movie", tmdbId: 57800 },
      { mediaType: "movie", tmdbId: 278154 },
    ]);
    expect(asMember?.addAllMissing).toEqual([]);

    const asAdmin = titleDetailDto("movie", 425, true, pageData()).franchise;
    expect(asAdmin?.requestAllMissing).toEqual([]);
    expect(asAdmin?.addAllMissing.map((i) => i.tmdbId)).toEqual([950, 8355, 57800, 278154]);
  });
});
