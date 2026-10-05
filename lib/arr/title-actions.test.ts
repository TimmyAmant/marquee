import { beforeEach, describe, expect, it, vi } from "vitest";

// Adding a movie against a real Postgres (PGlite, lib/test/pglite.ts) with
// Radarr mocked out: a root folder picked over the server's own has to be
// one Radarr actually has — an auto-approved request can't send Radarr an
// arbitrary path.

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", async () => (await import("@/lib/test/pglite")).testDatabase());
vi.mock("@/lib/cache/revalidate", () => ({ revalidatePathSafely: () => undefined }));
vi.mock("@/lib/crypto/encryption", () => ({ decryptSecret: () => "key", encryptSecret: () => ({}) }));
vi.mock("@/lib/tmdb/cache", () => ({ getOrFetchTitle: async () => ({ imdbId: null }) }));
const radarrMock = vi.hoisted(() => ({
  folders: [{ id: 1, path: "/movies/" }, { id: 2, path: "/kids/" }] as { id: number; path: string }[] | null,
  addMovie: vi.fn(async (..._args: unknown[]) => ({ id: 42 })),
}));
vi.mock("@/lib/radarr/client", () => ({
  getRootFolders: async () => {
    if (!radarrMock.folders) throw new Error("unreachable");
    return radarrMock.folders;
  },
  getMovieByTmdbId: async () => null,
  lookupByTmdbId: async () => ({ tmdbId: 438631 }),
  addMovie: radarrMock.addMovie,
}));

import { resetTestDatabase, testDatabase } from "@/lib/test/pglite";
import { arrServers, users } from "@/lib/db/schema";
import { addMovieToRadarrForUser } from "@/lib/arr/title-actions";

async function db() {
  return (await testDatabase()).db;
}

let admin: string;

beforeEach(async () => {
  await resetTestDatabase();
  vi.clearAllMocks();
  radarrMock.folders = [{ id: 1, path: "/movies/" }, { id: 2, path: "/kids/" }];
  const [a] = await (await db()).insert(users).values({ username: "admin", role: "admin", permissions: [] }).returning();
  admin = a.id;
  const secret = Buffer.from("x");
  await (await db()).insert(arrServers).values({
    userId: admin,
    kind: "radarr",
    name: "Radarr",
    baseUrl: "http://radarr:7878",
    apiKeyEnc: secret,
    apiKeyIv: secret,
    apiKeyTag: secret,
    isDefault: true,
    qualityProfileId: 1,
    rootFolderPath: "/movies/",
    webhookSecret: "s",
  });
});

const addedTo = () => (radarrMock.addMovie.mock.calls[0]?.[1] as { rootFolderPath: string } | undefined)?.rootFolderPath;

describe("addMovieToRadarrForUser root folders", () => {
  it("adds to the server's own folder without asking Radarr for its list", async () => {
    expect(await addMovieToRadarrForUser(admin, 438631)).toMatchObject({ ok: true });
    expect(addedTo()).toBe("/movies/");
  });

  it("takes a picked folder Radarr has, in Radarr's own spelling", async () => {
    expect(await addMovieToRadarrForUser(admin, 438631, false, { rootFolderPath: "/kids" })).toMatchObject({ ok: true });
    expect(addedTo()).toBe("/kids/");
  });

  it("refuses a folder Radarr doesn't have", async () => {
    expect(await addMovieToRadarrForUser(admin, 438631, false, { rootFolderPath: "/etc" })).toMatchObject({
      ok: false,
      code: "invalid",
    });
    expect(await addMovieToRadarrForUser(admin, 438631, false, { rootFolderPath: "/movies/../etc" })).toMatchObject({
      ok: false,
      code: "invalid",
    });
    expect(radarrMock.addMovie).not.toHaveBeenCalled();
  });

  it("doesn't add when Radarr can't say which folders it has", async () => {
    radarrMock.folders = null;
    expect(await addMovieToRadarrForUser(admin, 438631, false, { rootFolderPath: "/kids" })).toMatchObject({
      ok: false,
      code: "upstream",
    });
    expect(radarrMock.addMovie).not.toHaveBeenCalled();
  });
});
