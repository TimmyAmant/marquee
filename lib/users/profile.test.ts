import { beforeEach, describe, expect, it, vi } from "vitest";

// A member's profile (lib/users/profile.ts): who may see it, and its request
// counts and limits. Against a real Postgres (PGlite).

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", async () => (await import("@/lib/test/pglite")).testDatabase());

import { resetTestDatabase, testDatabase } from "@/lib/test/pglite";
import { requests, users } from "@/lib/db/schema";
import { canViewProfile, loadMemberProfile, requestCounts } from "@/lib/users/profile";

async function db() {
  return (await testDatabase()).db;
}

async function seed() {
  const [admin] = await (await db()).insert(users).values({ username: "admin", role: "admin" }).returning();
  const [member] = await (await db())
    .insert(users)
    .values({ username: "member", displayName: "Mem", movieQuotaLimit: 5, movieQuotaDays: 7 })
    .returning();
  await (await db()).insert(requests).values([
    { requestedByUserId: member.id, mediaType: "movie", tmdbId: 1, title: "One" },
    { requestedByUserId: member.id, mediaType: "movie", tmdbId: 2, title: "Two", status: "approved" },
    { requestedByUserId: member.id, mediaType: "movie", tmdbId: 3, title: "Three", status: "rejected" },
    { requestedByUserId: member.id, mediaType: "tv", tmdbId: 4, title: "Four" },
    { requestedByUserId: admin.id, mediaType: "tv", tmdbId: 5, title: "Five" },
  ]);
  return { admin, member };
}

beforeEach(async () => {
  await resetTestDatabase();
});

describe("canViewProfile", () => {
  it("is yours, or anyone's for the admin", () => {
    expect(canViewProfile({ userId: "a", isAdmin: false }, "a")).toBe(true);
    expect(canViewProfile({ userId: "a", isAdmin: false }, "b")).toBe(false);
    expect(canViewProfile({ userId: "a", isAdmin: true }, "b")).toBe(true);
  });
});

describe("requestCounts", () => {
  it("adds up each type", () => {
    expect(requestCounts([{ mediaType: "movie", count: 2 }, { mediaType: "tv", count: 3 }])).toEqual({ total: 5, movie: 2, tv: 3 });
    expect(requestCounts([])).toEqual({ total: 0, movie: 0, tv: 0 });
  });
});

describe("loadMemberProfile", () => {
  it("counts a member's requests, leaving declined ones out, with their limits", async () => {
    const { admin, member } = await seed();
    const profile = await loadMemberProfile({ userId: admin.id, isAdmin: true, libraryOwnerId: admin.id }, member.id);
    expect(profile?.member.displayName).toBe("Mem");
    expect(profile?.requests).toEqual({ total: 3, movie: 2, tv: 1 });
    expect(profile?.limits.movie).toMatchObject({ limit: 5, used: 2, remaining: 3 });
    expect(profile?.limits.tv).toBeNull();
    expect(profile?.watchlist).toBeNull();
  });

  it("is yours to see, not another member's", async () => {
    const { admin, member } = await seed();
    const self = await loadMemberProfile({ userId: member.id, isAdmin: false, libraryOwnerId: admin.id }, member.id);
    expect(self?.requests.total).toBe(3);
    const other = await loadMemberProfile({ userId: member.id, isAdmin: false, libraryOwnerId: admin.id }, admin.id);
    expect(other).toBeNull();
  });

  it("is null for an account that doesn't exist", async () => {
    const { admin } = await seed();
    const missing = await loadMemberProfile(
      { userId: admin.id, isAdmin: true, libraryOwnerId: admin.id },
      "00000000-0000-4000-8000-000000000000",
    );
    expect(missing).toBeNull();
  });
});
