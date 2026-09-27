import { describe, expect, it } from "vitest";
import { posterActions, type PosterActionRules } from "@/lib/api/poster-actions";

// The one rule behind every list's canQuickAdd / canRequest / requested,
// as the website decides them: the admin adds, a member with the permission
// requests, nobody acts on what's already there.

const both = { movie: true, tv: true };
const none = { movie: false, tv: false };

const admin: PosterActionRules = {
  isAdmin: true,
  arrConfigured: both,
  mayRequest: both,
  blockedKeys: new Set(),
  requestedKeys: new Set(),
};

const member: PosterActionRules = {
  isAdmin: false,
  arrConfigured: none,
  mayRequest: both,
  blockedKeys: new Set(),
  requestedKeys: new Set(),
};

describe("posterActions", () => {
  it("offers the admin Add, never Request", () => {
    expect(posterActions(admin, "movie", 603, null)).toEqual({ canQuickAdd: true, canRequest: false, requested: false });
    expect(posterActions(admin, "tv", 1396, "untracked")).toEqual({ canQuickAdd: true, canRequest: false, requested: false });
  });

  it("offers the admin nothing when that type's Radarr/Sonarr isn't set up", () => {
    const rules = { ...admin, arrConfigured: { movie: true, tv: false } };
    expect(posterActions(rules, "movie", 603, null).canQuickAdd).toBe(true);
    expect(posterActions(rules, "tv", 1396, null)).toEqual({ canQuickAdd: false, canRequest: false, requested: false });
  });

  it("offers a member Request, never Add — even with the admin's servers set up", () => {
    expect(posterActions(member, "movie", 603, null)).toEqual({ canQuickAdd: false, canRequest: true, requested: false });
    expect(posterActions({ ...member, arrConfigured: both }, "movie", 603, null).canQuickAdd).toBe(false);
  });

  it("holds a member to their per-type request permission", () => {
    const moviesOnly = { ...member, mayRequest: { movie: true, tv: false } };
    expect(posterActions(moviesOnly, "movie", 603, null).canRequest).toBe(true);
    expect(posterActions(moviesOnly, "tv", 1396, null).canRequest).toBe(false);
  });

  it("offers no Request for a blocked title", () => {
    const rules = { ...member, blockedKeys: new Set(["movie:603"]) };
    expect(posterActions(rules, "movie", 603, null).canRequest).toBe(false);
    expect(posterActions(rules, "movie", 604, null).canRequest).toBe(true);
  });

  it("reads Requested once the viewer has a request in", () => {
    const rules = { ...member, requestedKeys: new Set(["tv:1396"]) };
    expect(posterActions(rules, "tv", 1396, null)).toEqual({ canQuickAdd: false, canRequest: false, requested: true });
    expect(posterActions(rules, "tv", 1397, null)).toEqual({ canQuickAdd: false, canRequest: true, requested: false });
  });

  it("offers nothing for what's owned, downloading or missing-but-monitored", () => {
    for (const status of ["owned", "tracked_downloading", "tracked_monitored", "coming_soon"] as const) {
      expect(posterActions(admin, "movie", 603, status)).toMatchObject({ canQuickAdd: false, canRequest: false });
      expect(posterActions(member, "movie", 603, status)).toMatchObject({ canQuickAdd: false, canRequest: false });
    }
  });

  it("still acts on an unmonitored title — an add or approved request turns monitoring back on", () => {
    expect(posterActions(admin, "movie", 603, "tracked_unmonitored").canQuickAdd).toBe(true);
    expect(posterActions(member, "movie", 603, "tracked_unmonitored").canRequest).toBe(true);
  });
});
