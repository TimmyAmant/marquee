import { beforeEach, describe, expect, it, vi } from "vitest";

// Override rules against a real Postgres (PGlite): saving and checking them,
// and an approval going where the matching rule says — under the reviewer's
// own picks. Sonarr/Radarr, TMDb and notifications are mocked out.

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", async () => (await import("@/lib/test/pglite")).testDatabase());
vi.mock("@/lib/cache/revalidate", () => ({ revalidatePathSafely: () => undefined }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/notifications/fan-out", () => ({ fanOut: vi.fn(async () => undefined) }));
vi.mock("@/lib/notifications/bus", () => ({ publishNotification: () => undefined }));
vi.mock("@/lib/push/deliver", () => ({ pushToUser: async () => 0, pushMessageFor: () => ({}) }));
vi.mock("@/lib/tmdb/cache", () => ({
  getOrFetchTitle: async (mediaType: string, tmdbId: number) => ({
    mediaType,
    tmdbId,
    name: "Spirited Away",
    posterPath: null,
    tvdbId: null,
    rawTmdb: { genres: [{ id: 16, name: "Animation" }], original_language: "ja", keywords: { keywords: [] } },
  }),
}));
const arr = vi.hoisted(() => ({
  addMovieToRadarrForUser: vi.fn(async (..._args: unknown[]) => ({
    ok: true as const,
    placement: { serverId: null, serverName: "Radarr", qualityProfileId: 1, rootFolderPath: "/m", tags: [], seriesType: null },
  })),
  addSeriesToSonarrForUser: vi.fn(async (..._args: unknown[]) => ({ ok: true as const, placement: {} })),
}));
vi.mock("@/lib/arr/title-actions", () => arr);
vi.mock("@/lib/integrations/library-owner", () => ({ getLibraryOwnerUserId: async () => null }));

import { resetTestDatabase, testDatabase } from "@/lib/test/pglite";
import { arrServers, requests, users } from "@/lib/db/schema";
import {
  createOverrideRule,
  deleteOverrideRule,
  listOverrideRules,
  parseOverrideRuleInput,
  ruleForRequest,
  updateOverrideRule,
} from "@/lib/arr/override-rules-server";
import { approveRequest } from "@/lib/requests/mutate";

async function db() {
  return (await testDatabase()).db;
}

let admin: string;
let kid: string;
let radarr: string;
let animeRadarr: string;

async function addServer(name: string, isDefault: boolean) {
  const secret = Buffer.from("x");
  const [row] = await (await db())
    .insert(arrServers)
    .values({
      userId: admin,
      kind: "radarr",
      name,
      baseUrl: "http://radarr:7878",
      apiKeyEnc: secret,
      apiKeyIv: secret,
      apiKeyTag: secret,
      isDefault,
      qualityProfileId: 1,
      rootFolderPath: "/movies",
      webhookSecret: name,
    })
    .returning({ id: arrServers.id });
  return row.id;
}

async function input(body: Record<string, unknown>) {
  const parsed = await parseOverrideRuleInput(body);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.input;
}

beforeEach(async () => {
  await resetTestDatabase();
  vi.clearAllMocks();
  const [a] = await (await db()).insert(users).values({ username: "admin", role: "admin", permissions: [] }).returning();
  const [k] = await (await db()).insert(users).values({ username: "kid", role: "member", permissions: ["requestMovies"] }).returning();
  admin = a.id;
  kid = k.id;
  radarr = await addServer("Radarr", true);
  animeRadarr = await addServer("Animation", false);
});

describe("saving rules", () => {
  it("refuses a rule without a name or server, or with a bad list", async () => {
    expect((await parseOverrideRuleInput({ serverId: radarr })).ok).toBe(false);
    expect((await parseOverrideRuleInput({ name: "x" })).ok).toBe(false);
    expect((await parseOverrideRuleInput({ name: "x", serverId: radarr, genres: ["16"] })).ok).toBe(false);
    expect((await parseOverrideRuleInput({ name: "x", serverId: radarr, languages: ["japanese"] })).ok).toBe(false);
  });

  it("adds, changes and removes a rule on one of the admin's servers", async () => {
    const created = await createOverrideRule(admin, await input({ name: "Animation", serverId: animeRadarr, genres: [16] }));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const updated = await updateOverrideRule(
      admin,
      created.rule.id,
      await input({ name: "Anime films", serverId: animeRadarr, genres: [16], languages: ["JA"], rootFolderPath: "/anime" }),
    );
    expect(updated).toMatchObject({ ok: true, rule: { name: "Anime films", languages: ["ja"], rootFolderPath: "/anime" } });
    expect((await listOverrideRules(admin)).map((r) => r.name)).toEqual(["Anime films"]);
    expect((await deleteOverrideRule(admin, created.rule.id)).ok).toBe(true);
    expect(await listOverrideRules(admin)).toEqual([]);
  });

  it("refuses a server that isn't the admin's, or a member who doesn't exist", async () => {
    expect((await createOverrideRule(kid, await input({ name: "x", serverId: radarr }))).ok).toBe(false);
    expect(
      (await createOverrideRule(admin, await input({ name: "x", serverId: radarr, userIds: ["00000000-0000-4000-8000-000000000000"] }))).ok,
    ).toBe(false);
  });
});

describe("applying rules", () => {
  beforeEach(async () => {
    await createOverrideRule(
      admin,
      await input({ name: "Animation", serverId: animeRadarr, genres: [16], qualityProfileId: 7, rootFolderPath: "/animation" }),
    );
  });

  it("finds the rule for a request", async () => {
    const applied = await ruleForRequest(admin, { mediaType: "movie", tmdbId: 129, is4k: false, requesterId: kid });
    expect(applied?.overrides).toEqual({ serverId: animeRadarr, qualityProfileId: 7, rootFolderPath: "/animation" });
    expect(await ruleForRequest(admin, { mediaType: "movie", tmdbId: 129, is4k: true, requesterId: kid })).toBeNull();
    expect(await ruleForRequest(admin, { mediaType: "movie", tmdbId: 129, is4k: false, requesterId: kid }, radarr)).toBeNull();
  });

  it("approves a request with the rule's picks", async () => {
    const [request] = await (await db())
      .insert(requests)
      .values({ requestedByUserId: kid, mediaType: "movie", tmdbId: 129, title: "Spirited Away" })
      .returning();
    expect((await approveRequest(request.id, admin)).ok).toBe(true);
    expect(arr.addMovieToRadarrForUser).toHaveBeenCalledWith(admin, 129, false, {
      serverId: animeRadarr,
      qualityProfileId: 7,
      rootFolderPath: "/animation",
    });
  });

  it("lets the reviewer's own picks win", async () => {
    const [request] = await (await db())
      .insert(requests)
      .values({ requestedByUserId: kid, mediaType: "movie", tmdbId: 129, title: "Spirited Away" })
      .returning();
    await approveRequest(request.id, admin, { rootFolderPath: "/kids" });
    expect(arr.addMovieToRadarrForUser).toHaveBeenCalledWith(admin, 129, false, {
      serverId: animeRadarr,
      qualityProfileId: 7,
      rootFolderPath: "/kids",
    });
    const [other] = await (await db())
      .insert(requests)
      .values({ requestedByUserId: kid, mediaType: "movie", tmdbId: 130, title: "Other" })
      .returning();
    await approveRequest(other.id, admin, { serverId: radarr });
    expect(arr.addMovieToRadarrForUser).toHaveBeenLastCalledWith(admin, 130, false, { serverId: radarr });
  });
});
