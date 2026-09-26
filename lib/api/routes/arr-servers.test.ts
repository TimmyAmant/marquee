import { beforeEach, describe, expect, it, vi } from "vitest";

// The /api/v1 routes for Sonarr/Radarr servers and add overrides, end to end
// through withApi and the real bearer-token checks, with the database and
// the *arr calls mocked out.

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", () => ({ db: {} }));
vi.mock("@/lib/cache/revalidate", () => ({ revalidatePathSafely: () => undefined }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const TRUSTED_ID = "22222222-2222-4222-8222-222222222222";
const MEMBER_ID = "33333333-3333-4333-8333-333333333333";
const SERVER_ID = "4f0c2a8e-1b7d-4c1e-9a55-3c2d8e6f7a10";
const REQUEST_ID = "28713d50-27f2-4230-9c95-c1e6a000f6c0";

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

const manage = vi.hoisted(() => ({
  createArrServer: vi.fn(),
  updateArrServer: vi.fn(),
  deleteArrServer: vi.fn(),
  getArrServerOptions: vi.fn(),
  regenerateArrServerSecret: vi.fn(),
  testArrServerConnection: vi.fn(),
}));
vi.mock("@/lib/arr/server-manage", () => ({ ...manage, SERVER_NOT_FOUND: "Server not found." }));

const servers = vi.hoisted(() => ({ listArrServers: vi.fn() }));
vi.mock("@/lib/arr/servers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/arr/servers")>()),
  listArrServers: servers.listArrServers,
}));

const mutate = vi.hoisted(() => ({ approveRequest: vi.fn() }));
vi.mock("@/lib/requests/mutate", () => mutate);

const addOptions = vi.hoisted(() => ({ getAddOptions: vi.fn() }));
vi.mock("@/lib/arr/add-options-server", () => addOptions);

const titleActions = vi.hoisted(() => ({ addTitleToLibrary: vi.fn() }));
vi.mock("@/lib/arr/title-actions", () => titleActions);

import * as serversRoute from "@/app/api/v1/settings/arr-servers/route";
import * as testRoute from "@/app/api/v1/settings/arr-servers/test/route";
import * as serverRoute from "@/app/api/v1/settings/arr-servers/[id]/route";
import * as approveRoute from "@/app/api/v1/requests/[id]/approve/route";
import * as addRoute from "@/app/api/v1/titles/[type]/[id]/add/route";
import * as addOptionsRoute from "@/app/api/v1/titles/[type]/[id]/add-options/route";
import type { ArrServer } from "@/lib/arr/servers";

const ADMIN = "mqt_" + "a".repeat(43);
const TRUSTED = "mqt_" + "t".repeat(43);
const MEMBER = "mqt_" + "m".repeat(43);

function call<P extends Record<string, string>>(
  handler: (request: Request, context: { params: Promise<P> }) => Promise<Response>,
  { method = "GET", token = ADMIN, body, params = {} as P, url = "http://marquee.local:3000/api/v1/x" }: {
    method?: string;
    token?: string;
    body?: unknown;
    params?: P;
    url?: string;
  } = {},
) {
  const request = new Request(url, {
    method,
    headers: { authorization: `Bearer ${token}`, host: "marquee.local:3000", "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return handler(request, { params: Promise.resolve(params) });
}

const savedServer: ArrServer = {
  id: SERVER_ID,
  userId: ADMIN_ID,
  kind: "radarr",
  name: "Radarr 2",
  baseUrl: "http://192.168.1.10:7878",
  apiKey: "the-real-api-key",
  is4k: false,
  isDefault: false,
  qualityProfileId: 6,
  rootFolderPath: "/movies-kids",
  tags: [2],
  seriesType: null,
  seasonFolders: null,
  animeQualityProfileId: null,
  animeRootFolderPath: null,
  animeTags: [],
  webhookSecret: "51c0",
  createdAt: new Date("2026-09-01"),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("/settings/arr-servers", () => {
  it("lists servers without their API keys, with per-server webhook URLs", async () => {
    servers.listArrServers.mockResolvedValue([savedServer]);
    const res = await call(serversRoute.GET);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain("the-real-api-key");
    expect(JSON.parse(text).results[0]).toMatchObject({
      id: SERVER_ID,
      name: "Radarr 2",
      hasApiKey: true,
      webhookUrl: `http://marquee.local:3000/api/webhooks/servers/${SERVER_ID}?secret=51c0`,
    });
  });

  it("is the admin's alone", async () => {
    for (const token of [TRUSTED, MEMBER]) {
      const res = await call(serversRoute.GET, { token });
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "Only the admin can manage integrations.", code: "forbidden" });
    }
    expect(servers.listArrServers).not.toHaveBeenCalled();
  });

  it("adds a server with 201, validating kind and fields first", async () => {
    manage.createArrServer.mockResolvedValue({ ok: true, server: savedServer });
    const res = await call(serversRoute.POST, {
      method: "POST",
      body: { kind: "radarr", baseUrl: "http://192.168.1.10:7878/", apiKey: "k", tags: [2] },
    });
    expect(res.status).toBe(201);
    expect(manage.createArrServer).toHaveBeenCalledWith(ADMIN_ID, "radarr", {
      baseUrl: "http://192.168.1.10:7878",
      apiKey: "k",
      tags: [2],
    });
    expect(JSON.stringify(await res.json())).not.toContain("the-real-api-key");

    const noKind = await call(serversRoute.POST, { method: "POST", body: { baseUrl: "http://x", apiKey: "k" } });
    expect(noKind.status).toBe(400);
    expect((await noKind.json()).error).toBe('"kind" must be sonarr or radarr.');

    const badTags = await call(serversRoute.POST, { method: "POST", body: { kind: "sonarr", tags: ["x"] } });
    expect(badTags.status).toBe(400);
    expect(manage.createArrServer).toHaveBeenCalledTimes(1);
  });

  it("passes connection failures through with their status", async () => {
    manage.createArrServer.mockResolvedValue({
      ok: false,
      code: "upstream",
      error: "Couldn't connect. Check the URL and API key and try again.",
    });
    const res = await call(serversRoute.POST, { method: "POST", body: { kind: "radarr", baseUrl: "http://x", apiKey: "k" } });
    expect(res.status).toBe(502);
  });

  it("tests with a saved server's id instead of its key", async () => {
    manage.testArrServerConnection.mockResolvedValue({
      ok: true,
      version: "5.26",
      qualityProfiles: [],
      rootFolders: [],
      tags: [{ id: 2, label: "kids" }],
    });
    const res = await call(testRoute.POST, { method: "POST", body: { serverId: SERVER_ID } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, version: "5.26", qualityProfiles: [], rootFolders: [], tags: [{ id: 2, label: "kids" }] });
    expect(manage.testArrServerConnection).toHaveBeenCalledWith(ADMIN_ID, {
      kind: undefined,
      serverId: SERVER_ID,
      baseUrl: undefined,
      apiKey: undefined,
    });
  });

  it("edits and removes by id, 404 for a malformed one", async () => {
    manage.updateArrServer.mockResolvedValue({ ok: true, server: { ...savedServer, isDefault: true } });
    const res = await call(serverRoute.PATCH, { method: "PATCH", body: { isDefault: true }, params: { id: SERVER_ID } });
    expect(res.status).toBe(200);
    expect((await res.json()).server.isDefault).toBe(true);
    expect(manage.updateArrServer).toHaveBeenCalledWith(ADMIN_ID, SERVER_ID, { isDefault: true });

    manage.updateArrServer.mockResolvedValue({ ok: false, code: "conflict", error: "Make another server the default instead." });
    const conflict = await call(serverRoute.PATCH, { method: "PATCH", body: { isDefault: false }, params: { id: SERVER_ID } });
    expect(conflict.status).toBe(409);

    const bad = await call(serverRoute.DELETE, { method: "DELETE", params: { id: "nope" } });
    expect(bad.status).toBe(404);
    expect(manage.deleteArrServer).not.toHaveBeenCalled();

    manage.deleteArrServer.mockResolvedValue({ ok: true });
    const removed = await call(serverRoute.DELETE, { method: "DELETE", params: { id: SERVER_ID } });
    expect(await removed.json()).toEqual({ ok: true });
  });
});

describe("POST /requests/{id}/approve with overrides", () => {
  it("with no body approves with the defaults, as older clients do", async () => {
    mutate.approveRequest.mockResolvedValue({ ok: true });
    const res = await call(approveRoute.POST, { method: "POST", params: { id: REQUEST_ID } });
    expect(res.status).toBe(200);
    expect(mutate.approveRequest).toHaveBeenCalledWith(REQUEST_ID, ADMIN_ID, {});
  });

  it("passes the picks on, for the admin and a trusted member alike", async () => {
    mutate.approveRequest.mockResolvedValue({ ok: true });
    const body = { serverId: SERVER_ID, qualityProfileId: 6, rootFolderPath: "/movies-kids", tags: [2], seriesType: "anime" };
    await call(approveRoute.POST, { method: "POST", params: { id: REQUEST_ID }, body });
    await call(approveRoute.POST, { method: "POST", params: { id: REQUEST_ID }, body, token: TRUSTED });
    expect(mutate.approveRequest).toHaveBeenNthCalledWith(1, REQUEST_ID, ADMIN_ID, body);
    expect(mutate.approveRequest).toHaveBeenNthCalledWith(2, REQUEST_ID, TRUSTED_ID, body);
  });

  it("refuses bad picks before approving anything, and members entirely", async () => {
    const bad = await call(approveRoute.POST, { method: "POST", params: { id: REQUEST_ID }, body: { tags: [0] } });
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toBe('"tags" must be a list of numbers.');
    const member = await call(approveRoute.POST, { method: "POST", params: { id: REQUEST_ID }, token: MEMBER });
    expect(member.status).toBe(403);
    expect(mutate.approveRequest).not.toHaveBeenCalled();
  });

  it("answers a server of the wrong kind with 400", async () => {
    mutate.approveRequest.mockResolvedValue({ ok: false, code: "invalid", error: "That server can't take this request." });
    const res = await call(approveRoute.POST, { method: "POST", params: { id: REQUEST_ID }, body: { serverId: SERVER_ID } });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("That server can't take this request.");
  });
});

describe("POST /titles/{type}/{id}/add with overrides", () => {
  it("keeps is4k and adds the picks; a movie ignores series type", async () => {
    titleActions.addTitleToLibrary.mockResolvedValue({ ok: true });
    await call(addRoute.POST, {
      method: "POST",
      params: { type: "movie", id: "438631" },
      body: { is4k: true, serverId: SERVER_ID, seriesType: "anime" },
    });
    expect(titleActions.addTitleToLibrary).toHaveBeenCalledWith(ADMIN_ID, "movie", 438631, true, { serverId: SERVER_ID });

    await call(addRoute.POST, { method: "POST", params: { type: "tv", id: "95396" } });
    expect(titleActions.addTitleToLibrary).toHaveBeenLastCalledWith(ADMIN_ID, "tv", 95396, false, {});
  });
});

describe("GET /titles/{type}/{id}/add-options", () => {
  it("answers reviewers with the admin's servers; 4K on request", async () => {
    addOptions.getAddOptions.mockResolvedValue({ mediaType: "movie", tmdbId: 603, is4k: true, isAnime: false, servers: [] });
    const res = await call(addOptionsRoute.GET, {
      token: TRUSTED,
      params: { type: "movie", id: "603" },
      url: "http://marquee.local:3000/api/v1/titles/movie/603/add-options?is4k=true",
    });
    expect(res.status).toBe(200);
    expect(addOptions.getAddOptions).toHaveBeenCalledWith(ADMIN_ID, "movie", 603, true);
  });

  it("is forbidden to members and rejects a bad is4k", async () => {
    const member = await call(addOptionsRoute.GET, { token: MEMBER, params: { type: "movie", id: "603" } });
    expect(member.status).toBe(403);
    const bad = await call(addOptionsRoute.GET, {
      params: { type: "movie", id: "603" },
      url: "http://marquee.local:3000/api/v1/titles/movie/603/add-options?is4k=maybe",
    });
    expect(bad.status).toBe(400);
  });
});
