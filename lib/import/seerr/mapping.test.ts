import { describe, expect, it } from "vitest";
import { TRUSTED_PRESET } from "@/lib/users/permissions";
import {
  isSeerrAdmin,
  mapSeerrBlocklistItem,
  mapSeerrIssue,
  mapSeerrPermissions,
  mapSeerrQuota,
  mapSeerrRequest,
  mapSeerrRequestStatus,
  mapSeerrSeasons,
  matchArrServer,
  matchSeerrUser,
  normalizeArrUrl,
  normalizeSeerrUrl,
  seerrAccountKind,
  seerrArrServerUrl,
  seerrInstanceKey,
  seerrUsernameFor,
  SEERR_PERMISSION as P,
} from "@/lib/import/seerr/mapping";
import type { SeerrIssue, SeerrRequest, SeerrUser } from "@/lib/import/seerr/types";

// The rules docs/migrating-from-seerr.md promises, one by one.

describe("Seerr addresses", () => {
  it("normalizes what was typed", () => {
    expect(normalizeSeerrUrl(" http://seerr.local:5055/ ")).toBe("http://seerr.local:5055");
    expect(normalizeSeerrUrl("https://requests.example.com/api/v1/")).toBe("https://requests.example.com");
    expect(normalizeSeerrUrl("seerr.local:5055")).toBe("");
    expect(normalizeSeerrUrl("ftp://seerr.local")).toBe("");
  });

  it("keys an instance by host and port", () => {
    expect(seerrInstanceKey("http://Seerr.local:5055")).toBe("seerr.local:5055");
    expect(seerrInstanceKey("https://requests.example.com")).toBe("requests.example.com:443");
    expect(seerrInstanceKey("http://192.168.1.20")).toBe("192.168.1.20:80");
  });
});

describe("mapSeerrPermissions", () => {
  it("turns each bit into its switches", () => {
    expect(mapSeerrPermissions(P.REQUEST).permissions).toEqual(["requestMovies", "requestTv"]);
    expect(mapSeerrPermissions(P.REQUEST_MOVIE).permissions).toEqual(["requestMovies"]);
    expect(mapSeerrPermissions(P.REQUEST_4K_TV).permissions).toEqual(["request4kTv"]);
    expect(mapSeerrPermissions(P.AUTO_APPROVE).permissions).toEqual(["autoApproveMovies", "autoApproveTv"]);
    expect(mapSeerrPermissions(P.AUTO_APPROVE_4K_MOVIE).permissions).toEqual(["autoApprove4kMovies"]);
    expect(mapSeerrPermissions(P.REQUEST_ADVANCED).permissions).toEqual(["advancedRequests"]);
    expect(mapSeerrPermissions(P.REQUEST_VIEW).permissions).toEqual(["viewRequests"]);
    expect(mapSeerrPermissions(P.MANAGE_REQUESTS).permissions).toEqual(["viewRequests", "reviewRequests"]);
    expect(mapSeerrPermissions(P.MANAGE_ISSUES).permissions).toEqual(["manageIssues"]);
    expect(mapSeerrPermissions(P.CREATE_ISSUES).permissions).toEqual(["reportIssues"]);
    expect(mapSeerrPermissions(P.MANAGE_BLOCKLIST).permissions).toEqual(["manageBlocklist"]);
  });

  it("combines bits in Marquee's order, once each", () => {
    const mask = P.REQUEST | P.REQUEST_MOVIE | P.REQUEST_4K | P.CREATE_ISSUES | P.MANAGE_REQUESTS | P.REQUEST_ADVANCED;
    expect(mapSeerrPermissions(mask).permissions).toEqual([
      "requestMovies",
      "requestTv",
      "request4kMovies",
      "request4kTv",
      "advancedRequests",
      "viewRequests",
      "reviewRequests",
      "reportIssues",
    ]);
  });

  it("makes ADMIN the Trusted preset, never an admin", () => {
    expect(mapSeerrPermissions(P.ADMIN).permissions).toEqual([...TRUSTED_PRESET]);
    expect(mapSeerrPermissions(P.ADMIN | P.MANAGE_USERS).dropped).toEqual([]);
    expect(isSeerrAdmin({ permissions: P.ADMIN | P.REQUEST })).toBe(true);
    expect(isSeerrAdmin({ permissions: P.MANAGE_USERS | P.MANAGE_SETTINGS })).toBe(false);
  });

  it("reports the bits with no equivalent", () => {
    const { permissions, dropped } = mapSeerrPermissions(P.MANAGE_USERS | P.VOTE | P.AUTO_REQUEST_TV | P.VIEW_BLOCKLIST | P.REQUEST);
    expect(permissions).toEqual(["requestMovies", "requestTv"]);
    expect(dropped).toEqual(["MANAGE_USERS", "VOTE", "VIEW_BLOCKLIST", "AUTO_REQUEST_TV"]);
    expect(mapSeerrPermissions(0)).toEqual({ permissions: [], dropped: [] });
  });
});

describe("mapSeerrQuota", () => {
  const user: SeerrUser = { id: 4, movieQuotaLimit: 3, movieQuotaDays: 10, tvQuotaLimit: null, tvQuotaDays: null };

  it("takes the limits in force from the quota endpoint", () => {
    expect(mapSeerrQuota({ movie: { limit: 5, days: 7 }, tv: { limit: 2, days: 14 } }, user)).toEqual({
      movieQuotaLimit: 5,
      movieQuotaDays: 7,
      tvQuotaLimit: 2,
      tvQuotaDays: 14,
    });
  });

  it("reads 0 or a missing limit as no limit, with the default days", () => {
    expect(mapSeerrQuota({ movie: { limit: 0, days: 7 }, tv: {} }, user)).toEqual({
      movieQuotaLimit: null,
      movieQuotaDays: 7,
      tvQuotaLimit: null,
      tvQuotaDays: 7,
    });
  });

  it("falls back to the user's own fields without the quota endpoint", () => {
    expect(mapSeerrQuota(null, user)).toEqual({ movieQuotaLimit: 3, movieQuotaDays: 10, tvQuotaLimit: null, tvQuotaDays: 7 });
  });
});

describe("accounts", () => {
  const candidates = [
    { id: "u-admin", username: "admin", role: "admin", plexUserId: "1001", jellyfinUserId: null },
    { id: "u-anna", username: "anna", role: "member", plexUserId: null, jellyfinUserId: "JF-ANNA" },
    { id: "u-bob", username: "bob@example.test", role: "member", plexUserId: null, jellyfinUserId: null },
    { id: "u-carol", username: "Carol", role: "member", plexUserId: null, jellyfinUserId: null },
  ];

  it("matches by Plex id before anything else", () => {
    expect(matchSeerrUser({ id: 1, plexId: 1001, email: "anna@x", username: "anna" }, candidates)).toEqual({ user: candidates[0], by: "plex" });
  });

  it("matches by Jellyfin user id, case-insensitively", () => {
    expect(matchSeerrUser({ id: 2, jellyfinUserId: "jf-anna", username: "someone" }, candidates)?.by).toBe("jellyfin");
  });

  it("matches an email against a username, then any of the names", () => {
    expect(matchSeerrUser({ id: 3, email: "Bob@Example.test" }, candidates)?.user.id).toBe("u-bob");
    expect(matchSeerrUser({ id: 4, email: "c@x", plexUsername: "carol" }, candidates)?.user.id).toBe("u-carol");
    expect(matchSeerrUser({ id: 5, email: "d@x", jellyfinUsername: "CAROL" }, candidates)?.by).toBe("username");
  });

  it("never matches on a display name, and never guesses", () => {
    expect(matchSeerrUser({ id: 6, displayName: "anna", email: "other@x" }, candidates)).toBeNull();
    expect(matchSeerrUser({ id: 7, plexId: 9999 }, candidates)).toBeNull();
  });

  it("knows what kind of account it was", () => {
    expect(seerrAccountKind({ userType: 1, plexId: 5 })).toBe("plex");
    expect(seerrAccountKind({ userType: 3, jellyfinUserId: "x" })).toBe("jellyfin");
    expect(seerrAccountKind({ userType: 4, jellyfinUserId: "x" })).toBe("jellyfin");
    expect(seerrAccountKind({ userType: 2 })).toBe("local");
  });

  it("picks a username that fits Marquee's rules", () => {
    expect(seerrUsernameFor({ id: 1, username: "Anna Ó", email: "anna@example.test" })).toBe("Anna.O");
    expect(seerrUsernameFor({ id: 2, email: "bob.smith@example.test" })).toBe("bob.smith");
    expect(seerrUsernameFor({ id: 3, plexUsername: "plexbob" })).toBe("plexbob");
    expect(seerrUsernameFor({ id: 4 })).toBe("user");
  });
});

describe("requests", () => {
  it("maps statuses: failed and completed were approved", () => {
    expect(mapSeerrRequestStatus(1)).toBe("pending");
    expect(mapSeerrRequestStatus(2)).toBe("approved");
    expect(mapSeerrRequestStatus(3)).toBe("rejected");
    expect(mapSeerrRequestStatus(4)).toBe("approved");
    expect(mapSeerrRequestStatus(5)).toBe("approved");
    expect(mapSeerrRequestStatus(9)).toBeNull();
  });

  it("keeps a TV request's seasons sorted and unique, null for the whole series or a movie", () => {
    expect(mapSeerrSeasons({ type: "tv", seasons: [{ seasonNumber: 3 }, { seasonNumber: 1 }, { seasonNumber: 3 }] })).toEqual([1, 3]);
    expect(mapSeerrSeasons({ type: "tv", seasons: [] })).toBeNull();
    expect(mapSeerrSeasons({ type: "movie", seasons: [{ seasonNumber: 1 }] })).toBeNull();
    expect(mapSeerrSeasons({ media: { id: 1, mediaType: "tv" }, seasons: [{ seasonNumber: 2 }] })).toEqual([2]);
  });

  it("maps a whole request, 4K and server picks included", () => {
    const seerr: SeerrRequest = {
      id: 12,
      status: 2,
      type: "tv",
      media: { id: 7, mediaType: "tv", tmdbId: 1396 },
      is4k: true,
      serverId: 1,
      profileId: 6,
      rootFolder: "/tv",
      tags: [3],
      seasons: [{ seasonNumber: 2 }, { seasonNumber: 1 }],
      createdAt: "2026-01-02T03:04:05.000Z",
      updatedAt: "2026-01-03T00:00:00.000Z",
    };
    const mapped = mapSeerrRequest(seerr);
    expect(mapped.ok && mapped.request).toEqual({
      mediaType: "tv",
      tmdbId: 1396,
      status: "approved",
      is4k: true,
      seasons: [1, 2],
      createdAt: new Date("2026-01-02T03:04:05.000Z"),
      reviewedAt: new Date("2026-01-03T00:00:00.000Z"),
      serverId: 1,
      profileId: 6,
      rootFolder: "/tv",
      tags: [3],
    });
  });

  it("leaves a pending request unreviewed and refuses one without media", () => {
    const pending = mapSeerrRequest({ id: 1, status: 1, type: "movie", media: { id: 2, mediaType: "movie", tmdbId: 603 } });
    expect(pending.ok && pending.request.reviewedAt).toBeNull();
    expect(pending.ok && pending.request.is4k).toBe(false);
    expect(mapSeerrRequest({ id: 2, status: 1, type: "movie", media: null })).toEqual({ ok: false, reason: "no_media" });
    expect(mapSeerrRequest({ id: 3, status: 42, type: "movie", media: { id: 2, mediaType: "movie", tmdbId: 603 } })).toEqual({ ok: false, reason: "unknown_status" });
  });
});

describe("Sonarr/Radarr servers", () => {
  it("builds Seerr's server address and compares spellings", () => {
    expect(seerrArrServerUrl({ id: 1, hostname: "Radarr.Local", port: 7878, useSsl: false, baseUrl: "" })).toBe("http://radarr.local:7878");
    expect(seerrArrServerUrl({ id: 2, hostname: "media.example.com", port: 443, useSsl: true, baseUrl: "sonarr/" })).toBe("https://media.example.com:443/sonarr");
    expect(normalizeArrUrl("https://media.example.com/sonarr/")).toBe("https://media.example.com:443/sonarr");
    expect(normalizeArrUrl("http://192.168.1.10:8989")).toBe("http://192.168.1.10:8989");
    expect(normalizeArrUrl("nope")).toBeNull();
  });

  it("matches a Marquee server of the same kind at the same address", () => {
    const servers = [
      { id: "s1", name: "Sonarr", baseUrl: "http://192.168.1.10:8989/", kind: "sonarr" as const, is4k: false },
      { id: "r1", name: "Radarr 4K", baseUrl: "http://192.168.1.10:7878", kind: "radarr" as const, is4k: true },
    ];
    expect(matchArrServer({ id: 1, hostname: "192.168.1.10", port: 8989, useSsl: false }, "sonarr", servers)?.id).toBe("s1");
    expect(matchArrServer({ id: 1, hostname: "192.168.1.10", port: 8989, useSsl: false }, "radarr", servers)).toBeNull();
    expect(matchArrServer({ id: 2, hostname: "192.168.1.10", port: 7878, useSsl: false }, "radarr", servers)?.id).toBe("r1");
    expect(matchArrServer({ id: 3 }, "radarr", servers)).toBeNull();
  });
});

describe("problem reports", () => {
  const issue: SeerrIssue = {
    id: 5,
    issueType: 3,
    status: 2,
    problemSeason: 2,
    problemEpisode: 5,
    media: { id: 9, mediaType: "tv", tmdbId: 1396 },
    createdBy: { id: 3 },
    modifiedBy: { id: 1 },
    createdAt: "2026-02-01T10:00:00.000Z",
    updatedAt: "2026-02-02T10:00:00.000Z",
    comments: [
      { id: 21, user: { id: 1 }, message: "Searching again", createdAt: "2026-02-01T11:00:00.000Z" },
      { id: 20, user: { id: 3 }, message: "No subtitles on E5", createdAt: "2026-02-01T10:00:00.000Z" },
      { id: 22, user: { id: 3 }, message: "  ", createdAt: "2026-02-01T12:00:00.000Z" },
    ],
  };

  it("takes the reporter's first comment as the report and keeps the rest", () => {
    const mapped = mapSeerrIssue(issue);
    expect(mapped.ok && mapped.issue).toEqual({
      mediaType: "tv",
      tmdbId: 1396,
      kind: "subtitles",
      seasonNumber: 2,
      episodeNumber: 5,
      status: "resolved",
      message: "No subtitles on E5",
      createdAt: new Date("2026-02-01T10:00:00.000Z"),
      resolvedAt: new Date("2026-02-02T10:00:00.000Z"),
      comments: [{ id: 21, authorSeerrId: 1, body: "Searching again", createdAt: new Date("2026-02-01T11:00:00.000Z") }],
    });
  });

  it("keeps a first comment by someone else as a comment", () => {
    const mapped = mapSeerrIssue({ ...issue, comments: [issue.comments![0]] });
    expect(mapped.ok && mapped.issue.message).toBeNull();
    expect(mapped.ok && mapped.issue.comments).toHaveLength(1);
  });

  it("reads season/episode 0 as the whole title, and types by number", () => {
    const mapped = mapSeerrIssue({ ...issue, issueType: 1, status: 1, problemSeason: 0, problemEpisode: 3 });
    expect(mapped.ok && mapped.issue).toMatchObject({ kind: "video", status: "open", seasonNumber: null, episodeNumber: null, resolvedAt: null });
    const movie = mapSeerrIssue({ ...issue, issueType: 4, media: { id: 1, mediaType: "movie", tmdbId: 603 } });
    expect(movie.ok && movie.issue).toMatchObject({ kind: "other", seasonNumber: null, episodeNumber: null });
    expect(mapSeerrIssue({ ...issue, media: null })).toEqual({ ok: false, reason: "no_media" });
  });
});

describe("blocklist", () => {
  it("keeps a title's name, refuses one without a TMDb id", () => {
    expect(mapSeerrBlocklistItem({ mediaType: "movie", tmdbId: 8392, title: "My Neighbor Totoro" })).toEqual({ mediaType: "movie", tmdbId: 8392, title: "My Neighbor Totoro" });
    expect(mapSeerrBlocklistItem({ mediaType: "tv", tmdbId: 1402 })).toEqual({ mediaType: "tv", tmdbId: 1402, title: null });
    expect(mapSeerrBlocklistItem({ mediaType: "book", tmdbId: 1 })).toBeNull();
    expect(mapSeerrBlocklistItem({ mediaType: "movie" })).toBeNull();
  });
});
