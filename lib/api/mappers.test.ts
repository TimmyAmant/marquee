import { describe, it, expect } from "vitest";
import {
  fileDetails,
  fourKViewerState,
  externalLinkDtos,
  iso,
  knownForTitleDto,
  myRequest,
  notFoundRequest,
  requestPerson,
  reviewedRequest,
  titleCard,
  titleViewerState,
} from "./mappers";
import { MEMBER_PRESET, permissionMap } from "@/lib/users/permissions";
import { englishT } from "@/lib/i18n/catalog";

describe("iso", () => {
  it("formats dates as ISO-8601 UTC with milliseconds", () => {
    expect(iso(new Date("2026-09-17T12:00:00Z"))).toBe("2026-09-17T12:00:00.000Z");
    expect(iso("2026-09-17T12:00:00Z")).toBe("2026-09-17T12:00:00.000Z");
  });

  it("returns null for missing or invalid dates", () => {
    expect(iso(null)).toBeNull();
    expect(iso(undefined)).toBeNull();
    expect(iso("not a date")).toBeNull();
  });
});

describe("titleCard", () => {
  it("always includes every field, defaulting to null/false", () => {
    expect(titleCard({ mediaType: "movie", tmdbId: 603, name: "The Matrix", posterPath: null, year: "1999" })).toEqual({
      mediaType: "movie",
      tmdbId: 603,
      name: "The Matrix",
      posterPath: null,
      year: "1999",
      subtitle: null,
      overview: null,
      rating: null,
      status: null,
      favorited: null,
      requested: null,
      canQuickAdd: false,
      canRequest: false,
      episodes: null,
    });
  });

  it("carries a series' episode counts, and never a movie's", () => {
    const counts = { have: 120, total: 125 };
    const series = titleCard(
      { mediaType: "tv", tmdbId: 1407, name: "Homeland", posterPath: null, year: "2011" },
      { episodes: counts },
    );
    expect(series.episodes).toEqual(counts);
    const movie = titleCard(
      { mediaType: "movie", tmdbId: 603, name: "The Matrix", posterPath: null, year: "1999" },
      { episodes: counts },
    );
    expect(movie.episodes).toBeNull();
    expect(
      titleCard({ mediaType: "tv", tmdbId: 1407, name: "Homeland", posterPath: null, year: "2011" }).episodes,
    ).toBeNull();
  });
});

describe("titleViewerState", () => {
  const base = {
    mediaType: "tv" as const,
    permissions: permissionMap({ role: "member", permissions: MEMBER_PRESET }),
    favorited: false,
    requestStatus: null,
    otherRequesters: [] as string[],
    arrTracking: null,
  };

  it("offers Add to an admin for an untracked title when *arr is configured", () => {
    const state = titleViewerState({ ...base, isAdmin: true, status: "untracked", configured: true });
    expect(state).toMatchObject({ canAdd: true, needsArrSetup: false, canRequest: false, canRelink: false });
  });

  it("leaves an unmonitored title Sonarr/Radarr already has to Start monitoring", () => {
    const state = titleViewerState({
      ...base,
      isAdmin: true,
      status: "untracked",
      configured: true,
      arrTracking: { arrId: 12, monitored: false },
    });
    expect(state).toMatchObject({ canAdd: false, arrTracking: { arrId: 12, monitored: false } });
  });

  it("treats tracked_unmonitored like untracked: Start monitoring for the admin, Request for a member", () => {
    const admin = titleViewerState({
      ...base,
      isAdmin: true,
      status: "tracked_unmonitored",
      configured: true,
      arrTracking: { arrId: 12, monitored: false },
    });
    expect(admin).toMatchObject({ canAdd: false, canRelink: false, arrTracking: { arrId: 12, monitored: false } });
    const member = titleViewerState({ ...base, isAdmin: false, status: "tracked_unmonitored", configured: true });
    expect(member).toMatchObject({ canRequest: true, canAdd: false });
  });

  it("points an admin at setup when *arr isn't configured", () => {
    const state = titleViewerState({ ...base, isAdmin: true, status: "untracked", configured: false });
    expect(state).toMatchObject({ canAdd: false, needsArrSetup: true });
  });

  it("offers Request to a member until they have a pending request", () => {
    expect(titleViewerState({ ...base, isAdmin: false, status: "untracked", configured: true }).canRequest).toBe(true);
    const pending = titleViewerState({
      ...base,
      isAdmin: false,
      status: "untracked",
      configured: true,
      requestStatus: "pending",
    });
    expect(pending).toMatchObject({ canRequest: false, alreadyRequested: true });
  });

  it("offers nothing to add or request for titles already in the library", () => {
    const admin = titleViewerState({ ...base, isAdmin: true, status: "owned", configured: true });
    expect(admin).toMatchObject({ canAdd: false, canRequest: false, canRelink: true });
    const member = titleViewerState({ ...base, isAdmin: false, status: "tracked_monitored", configured: true });
    expect(member).toMatchObject({ canAdd: false, canRequest: false, canRelink: false });
  });

  it("only exposes *arr tracking to the admin", () => {
    const tracking = { arrId: 12, monitored: true };
    expect(titleViewerState({ ...base, isAdmin: true, status: "owned", configured: true, arrTracking: tracking }).arrTracking).toEqual(tracking);
    expect(titleViewerState({ ...base, isAdmin: false, status: "owned", configured: true, arrTracking: tracking }).arrTracking).toBeNull();
  });

  it("defaults the season fields for a movie or an older loader", () => {
    expect(titleViewerState({ ...base, isAdmin: false, status: "untracked", configured: true })).toMatchObject({
      canRequestSeasons: false,
      requestedSeasons: null,
    });
  });

  it("passes season request state through, independent of whole-series canRequest", () => {
    const state = titleViewerState({
      ...base,
      isAdmin: false,
      status: "tracked_monitored",
      configured: true,
      seasonRequests: { canRequestSeasons: true, requestedSeasons: null },
    });
    expect(state).toMatchObject({ canRequest: false, canRequestSeasons: true, requestedSeasons: null });
  });
});

describe("fileDetails", () => {
  it("fills every field and derives the resolution tier", () => {
    expect(
      fileDetails({ path: "/movies/Dune (2021)/Dune.mkv", sizeBytes: 1024, quality: "Bluray-2160p", dateAdded: "2026-01-02T03:04:05Z" }),
    ).toEqual({
      path: "/movies/Dune (2021)/Dune.mkv",
      sizeBytes: 1024,
      quality: "Bluray-2160p",
      resolutionTier: "4K",
      resolution: null,
      videoCodec: null,
      dynamicRange: null,
      audioCodec: null,
      audioChannels: null,
      container: null,
      bitrateKbps: null,
      dateAdded: "2026-01-02T03:04:05.000Z",
      releaseGroup: null,
      edition: null,
    });
    expect(fileDetails(null)).toBeNull();
  });

  it("carries a media server's own detail through, tier included", () => {
    expect(
      fileDetails({
        path: "/movies/Sinners (2025)/Sinners.mkv",
        sizeBytes: 64 * 1024,
        resolution: "4K",
        videoCodec: "HEVC",
        dynamicRange: "DV",
        audioCodec: "TrueHD Atmos",
        audioChannels: 8,
        container: "MKV",
        bitrateKbps: 58421,
      }),
    ).toMatchObject({
      quality: null,
      // No *arr quality profile to derive a tier from — the media server's
      // resolution stands in for it.
      resolutionTier: "4K",
      resolution: "4K",
      videoCodec: "HEVC",
      dynamicRange: "DV",
      audioCodec: "TrueHD Atmos",
      audioChannels: 8,
      container: "MKV",
      bitrateKbps: 58421,
    });
  });

  it("derives a tier from a raw WxH resolution, and leaves an off-tier one alone", () => {
    expect(fileDetails({ path: null, sizeBytes: 1, resolution: "3840x1600" })?.resolutionTier).toBe("4K");
    expect(fileDetails({ path: null, sizeBytes: 1, resolution: "720x306" })?.resolutionTier).toBeNull();
  });
});

describe("request mapping", () => {
  it("labels a person by display name, falling back to username", () => {
    expect(requestPerson({ displayName: "Timmy", username: "timmy" }).label).toBe("Timmy");
    expect(requestPerson({ displayName: null, username: "timmy" })).toEqual({
      userId: null,
      displayName: null,
      username: "timmy",
      label: "timmy",
    });
  });

  it("maps a member's request with the page's status label", () => {
    const dto = myRequest(englishT(), {
      id: "11111111-1111-1111-1111-111111111111",
      mediaType: "tv",
      tmdbId: 1399,
      title: "Game of Thrones",
      posterPath: "/poster.jpg",
      seasons: [1, 2, 3, 5],
      status: "approved",
      manuallyApproved: false,
      rejectionReason: null,
      createdAt: new Date("2026-09-01T00:00:00Z"),
      reviewedAt: null,
      libraryStatus: "tracked_downloading",
    });
    expect(dto).toMatchObject({
      seasons: [1, 2, 3, 5],
      seasonsLabel: "Seasons 1–3, 5",
      statusLabel: "Downloading",
      statusTone: "downloading",
      rejectionReason: null,
      reviewedAt: null,
    });
    expect(dto.createdAt).toBe("2026-09-01T00:00:00.000Z");
  });

  it("carries the admin's rejection reason through to both request DTOs", () => {
    const base = {
      id: "11111111-1111-1111-1111-111111111111",
      mediaType: "movie" as const,
      tmdbId: 603,
      title: "The Matrix",
      posterPath: null,
      seasons: null,
      status: "rejected" as const,
      manuallyApproved: false,
      rejectionReason: "Not enough space on the server right now",
      createdAt: new Date("2026-09-01T00:00:00Z"),
      reviewedAt: new Date("2026-09-02T00:00:00Z"),
    };
    expect(myRequest(englishT(), { ...base, libraryStatus: null })).toMatchObject({
      seasons: null,
      seasonsLabel: null,
      statusLabel: "Declined",
      statusTone: "declined",
      rejectionReason: "Not enough space on the server right now",
    });
    expect(reviewedRequest(englishT(), { ...base, requestedByName: null, requestedByUsername: "member1" })).toMatchObject({
      statusLabel: "Rejected",
      rejectionReason: "Not enough space on the server right now",
      requestedBy: { label: "member1" },
      reviewedAt: "2026-09-02T00:00:00.000Z",
    });
  });

  it("says Removed, with the reason, for an approved request taken off the server", () => {
    const base = {
      id: "11111111-1111-1111-1111-111111111111",
      mediaType: "movie" as const,
      tmdbId: 603,
      title: "The Matrix",
      posterPath: null,
      seasons: null,
      status: "approved" as const,
      manuallyApproved: false,
      rejectionReason: null,
      arrServerName: "Radarr",
      createdAt: new Date("2026-09-01T00:00:00Z"),
      reviewedAt: new Date("2026-09-02T00:00:00Z"),
      removedAt: new Date("2026-09-10T00:00:00Z"),
      removedReason: "Couldn't find a good copy of it",
    };
    expect(myRequest(englishT(), { ...base, libraryStatus: "owned" })).toMatchObject({
      statusLabel: "Removed",
      statusTone: "declined",
      addedToServer: null,
      removedAt: "2026-09-10T00:00:00.000Z",
      removedReason: "Couldn't find a good copy of it",
    });
    expect(reviewedRequest(englishT(), { ...base, requestedByName: null, requestedByUsername: "member1" })).toMatchObject({
      statusLabel: "Removed",
      removedAt: "2026-09-10T00:00:00.000Z",
      removedReason: "Couldn't find a good copy of it",
    });
    // Removed before reasons could be given: still Removed, no reason.
    expect(myRequest(englishT(), { ...base, removedReason: null, libraryStatus: null })).toMatchObject({
      statusLabel: "Removed",
      removedReason: null,
    });
    // Not removed: both null.
    expect(myRequest(englishT(), { ...base, removedAt: null, libraryStatus: null })).toMatchObject({
      statusLabel: "Approved",
      removedAt: null,
      removedReason: null,
    });
  });
});

describe("fourKViewerState", () => {
  const free = { configured: true, status: "untracked" as const, requestStatus: null };

  it("is null without a 4K instance", () => {
    expect(fourKViewerState(false, null, true)).toBeNull();
  });

  it("offers a member Request in 4K and the admin Add, while the 4K instance doesn't have it", () => {
    expect(fourKViewerState(false, free, true)).toMatchObject({ canRequest: true, canAdd: false });
    expect(fourKViewerState(true, free, true)).toMatchObject({ canRequest: false, canAdd: true });
  });

  it("stays open while the 4K instance has it but isn't monitoring it", () => {
    const unmonitored = { ...free, status: "tracked_unmonitored" as const };
    expect(fourKViewerState(false, unmonitored, true)).toMatchObject({ canRequest: true, status: "tracked_unmonitored" });
    expect(fourKViewerState(true, unmonitored, true)).toMatchObject({ canAdd: true });
  });

  it("offers neither once it's requested, in the 4K library, or the instance isn't set up", () => {
    expect(fourKViewerState(false, { ...free, requestStatus: "pending" }, true)).toMatchObject({ canRequest: false });
    expect(fourKViewerState(false, { ...free, status: "owned" }, true)).toMatchObject({ canRequest: false, status: "owned" });
    expect(fourKViewerState(true, { ...free, configured: false }, true)).toMatchObject({ canAdd: false });
  });
});

describe("Can't find mapping", () => {
  it("maps a flagged request with where it went and a tip", () => {
    const dto = notFoundRequest(englishT(), {
      id: "11111111-1111-1111-1111-111111111111",
      mediaType: "movie",
      tmdbId: 425,
      title: "Ice Age",
      posterPath: null,
      seasons: null,
      is4k: false,
      createdAt: new Date("2026-09-01T00:00:00Z"),
      reviewedAt: new Date("2026-09-01T01:00:00Z"),
      notFoundSince: new Date("2026-09-02T01:20:00Z"),
      requestedByUserId: "22222222-2222-2222-2222-222222222222",
      requestedByName: "Susan",
      requestedByUsername: "susan",
      server: { id: "33333333-3333-3333-3333-333333333333", name: "Radarr", kind: "radarr" },
      arrUrl: "http://radarr:7878/movie/425",
    });
    expect(dto).toMatchObject({
      notFoundSince: "2026-09-02T01:20:00.000Z",
      requestedBy: { userId: "22222222-2222-2222-2222-222222222222", label: "Susan" },
      server: { name: "Radarr", kind: "radarr" },
      arrUrl: "http://radarr:7878/movie/425",
      seasonsLabel: null,
    });
    expect(dto.hint).toContain("Interactive Search");
  });

  it("adds notFoundSince to history rows and the title's viewer state", () => {
    const row = reviewedRequest(englishT(), {
      id: "11111111-1111-1111-1111-111111111111",
      mediaType: "movie",
      tmdbId: 425,
      title: "Ice Age",
      posterPath: null,
      seasons: null,
      status: "approved",
      manuallyApproved: false,
      rejectionReason: null,
      createdAt: new Date("2026-09-01T00:00:00Z"),
      reviewedAt: new Date("2026-09-01T01:00:00Z"),
      requestedByName: null,
      requestedByUsername: "susan",
    });
    expect(row.notFoundSince).toBeNull();
    const viewer = titleViewerState({
      isAdmin: true,
      mediaType: "movie",
      permissions: permissionMap({ role: "admin", permissions: [] }),
      status: "tracked_monitored",
      configured: true,
      favorited: false,
      requestStatus: null,
      otherRequesters: [],
      arrTracking: null,
      notFoundSince: new Date("2026-09-02T01:20:00Z"),
    });
    expect(viewer.notFoundSince).toBe("2026-09-02T01:20:00.000Z");
  });
});

describe("knownForTitleDto / externalLinkDtos", () => {
  it("maps a best-known title with artwork and drops one without", () => {
    expect(
      knownForTitleDto({ mediaType: "tv", tmdbId: 1100, name: "How I Met Your Mother", backdropPath: "/himym.jpg" }),
    ).toEqual({ mediaType: "tv", tmdbId: 1100, name: "How I Met Your Mother", backdropPath: "/himym.jpg" });
    expect(knownForTitleDto({ mediaType: "movie", tmdbId: 1, name: "No art", backdropPath: null })).toBeNull();
    expect(knownForTitleDto(null)).toBeNull();
  });

  it("keeps links in order with only kind and url", () => {
    expect(
      externalLinkDtos([
        { kind: "imdb", url: "https://www.imdb.com/name/nm0000439" },
        { kind: "homepage", url: "https://example.com/" },
      ]),
    ).toEqual([
      { kind: "imdb", url: "https://www.imdb.com/name/nm0000439" },
      { kind: "homepage", url: "https://example.com/" },
    ]);
  });
});
