import { describe, it, expect } from "vitest";
import {
  parseExternalIds,
  pickBestConnection,
  getFileSize,
  getFilePath,
  commonFolder,
  parseMediaDetail,
  parseDynamicRange,
} from "./client";
import type { PlexMetadataItem } from "./client";

describe("parseExternalIds", () => {
  it("parses tmdb/tvdb/imdb guids from the Guid array", () => {
    const result = parseExternalIds({
      ratingKey: "1",
      type: "movie",
      title: "Test",
      addedAt: 0,
      Guid: [{ id: "tmdb://603" }, { id: "tvdb://2288" }, { id: "imdb://tt0455275" }],
    });
    expect(result).toEqual({ tmdbId: 603, tvdbId: 2288, imdbId: "tt0455275" });
  });

  it("falls back to the single legacy `guid` field when Guid[] is absent", () => {
    const result = parseExternalIds({
      ratingKey: "1",
      type: "movie",
      title: "Test",
      addedAt: 0,
      guid: "tmdb://603",
    });
    expect(result.tmdbId).toBe(603);
  });

  it("returns nulls for a guid format it doesn't recognize (e.g. legacy agent guids)", () => {
    const result = parseExternalIds({
      ratingKey: "1",
      type: "show",
      title: "Test",
      addedAt: 0,
      guid: "com.plexapp.agents.thetvdb://2288?lang=en",
    });
    expect(result).toEqual({ tmdbId: null, tvdbId: null, imdbId: null });
  });

  it("returns nulls when there are no guids at all", () => {
    expect(parseExternalIds({ ratingKey: "1", type: "movie", title: "Test", addedAt: 0 })).toEqual({
      tmdbId: null,
      tvdbId: null,
      imdbId: null,
    });
  });
});

describe("pickBestConnection", () => {
  it("prefers a local, non-relay connection", () => {
    const uri = pickBestConnection([
      { uri: "https://relay", local: false, relay: true },
      { uri: "https://local", local: true, relay: false },
      { uri: "https://remote", local: false, relay: false },
    ]);
    expect(uri).toBe("https://local");
  });

  it("falls back to any direct (non-relay) connection when no local one exists", () => {
    const uri = pickBestConnection([
      { uri: "https://relay", local: false, relay: true },
      { uri: "https://remote", local: false, relay: false },
    ]);
    expect(uri).toBe("https://remote");
  });

  it("falls back to the first connection when everything is a relay", () => {
    const uri = pickBestConnection([{ uri: "https://relay", local: false, relay: true }]);
    expect(uri).toBe("https://relay");
  });

  it("returns null for an empty connection list", () => {
    expect(pickBestConnection([])).toBeNull();
  });
});

describe("getFileSize / getFilePath", () => {
  it("reads size/path off the first Media/Part entry", () => {
    const item = {
      ratingKey: "1",
      type: "movie" as const,
      title: "Test",
      addedAt: 0,
      Media: [{ Part: [{ size: 12345, file: "/movies/test.mkv" }] }],
    };
    expect(getFileSize(item)).toBe(12345);
    expect(getFilePath(item)).toBe("/movies/test.mkv");
  });

  it("returns null when there's no Media/Part at all", () => {
    const item = { ratingKey: "1", type: "show" as const, title: "Test", addedAt: 0 };
    expect(getFileSize(item)).toBeNull();
    expect(getFilePath(item)).toBeNull();
  });
});

describe("commonFolder", () => {
  it("collapses multiple seasons down to the show's shared root folder", () => {
    const result = commonFolder([
      "/tv/Lost Identity (2024)/Season 01/S01E01.mkv",
      "/tv/Lost Identity (2024)/Season 01/S01E02.mkv",
      "/tv/Lost Identity (2024)/Season 02/S02E01.mkv",
    ]);
    expect(result).toBe("/tv/Lost Identity (2024)");
  });

  it("returns the season folder itself when only one season is present", () => {
    const result = commonFolder([
      "/tv/Show/Season 01/S01E01.mkv",
      "/tv/Show/Season 01/S01E02.mkv",
    ]);
    expect(result).toBe("/tv/Show/Season 01");
  });

  it("doesn't false-positive on shows whose names share a string prefix", () => {
    // "/tv/Show 1" is NOT a valid common ancestor of these two — the
    // comparison has to be per path segment, not a raw string prefix.
    const result = commonFolder(["/tv/Show 1/ep.mkv", "/tv/Show 10/ep.mkv"]);
    expect(result).toBe("/tv");
  });

  it("returns null for a single file with no folder above the root", () => {
    expect(commonFolder(["/ep.mkv"])).toBeNull();
  });

  it("returns null for an empty list", () => {
    expect(commonFolder([])).toBeNull();
  });
});

describe("parseMediaDetail", () => {
  /** A section-listing entry: Media and Part, no Stream — which is all
   * /library/sections/{key}/all ever returns. */
  const listingItem = (media: Record<string, unknown>): PlexMetadataItem => ({
    ratingKey: "1",
    type: "movie",
    title: "Test",
    addedAt: 0,
    Media: [media],
  });

  it("reads a 4K HEVC TrueHD Atmos movie off the section listing", () => {
    const detail = parseMediaDetail(
      listingItem({
        videoResolution: "4k",
        videoCodec: "hevc",
        audioCodec: "truehd",
        audioChannels: 8,
        container: "mkv",
        bitrate: 58421,
        width: 3840,
        height: 1600,
        Part: [{ size: 61_000_000_000, file: "/movies/Test/Test.mkv", container: "mkv" }],
      }),
    );
    expect(detail).toEqual({
      resolution: "4K",
      videoCodec: "HEVC",
      // No streams in a listing, so no dynamic range yet — the batched
      // metadata fetch fills this one in.
      dynamicRange: null,
      audioCodec: "TrueHD",
      audioChannels: 8,
      container: "MKV",
      bitrateKbps: 58421,
    });
  });

  it("reads a 1080p H.264 AAC movie", () => {
    const detail = parseMediaDetail(
      listingItem({
        videoResolution: "1080",
        videoCodec: "h264",
        audioCodec: "aac",
        audioChannels: 2,
        container: "mp4",
        bitrate: 4210,
        Part: [{ size: 3_000_000_000, file: "/movies/Test/Test.mp4" }],
      }),
    );
    expect(detail).toMatchObject({
      resolution: "1080p",
      videoCodec: "H.264",
      audioCodec: "AAC",
      audioChannels: 2,
      container: "MP4",
      bitrateKbps: 4210,
    });
  });

  it("returns every field null when the item has no Media at all", () => {
    const detail = parseMediaDetail({ ratingKey: "1", type: "show", title: "Test", addedAt: 0 });
    expect(Object.values(detail).every((value) => value === null)).toBe(true);
  });

  it("fills in only what a sparse Media entry actually has", () => {
    const detail = parseMediaDetail(listingItem({ videoResolution: "720", Part: [{ size: 900 }] }));
    expect(detail).toEqual({
      resolution: "720p",
      videoCodec: null,
      dynamicRange: null,
      audioCodec: null,
      audioChannels: null,
      container: null,
      bitrateKbps: null,
    });
  });

  it("picks up Dolby Vision and Atmos from the streams full metadata carries", () => {
    const detail = parseMediaDetail(
      listingItem({
        videoResolution: "4k",
        videoCodec: "hevc",
        audioCodec: "eac3",
        audioChannels: 6,
        container: "mkv",
        Part: [
          {
            size: 61_000_000_000,
            Stream: [
              { streamType: 1, codec: "hevc", DOVIPresent: true, DOVIProfile: "7", colorTrc: "smpte2084" },
              { streamType: 2, codec: "eac3", channels: 6, profile: "joc" },
              { streamType: 3, codec: "subrip" },
            ],
          },
        ],
      }),
    );
    expect(detail.dynamicRange).toBe("DV");
    expect(detail.audioCodec).toBe("EAC3 Atmos");
  });
});

describe("parseDynamicRange", () => {
  const withVideoStream = (stream: Record<string, unknown>) => ({
    Part: [{ Stream: [{ streamType: 1, codec: "hevc", ...stream }] }],
  });

  it("reads HDR10 off the transfer characteristics", () => {
    expect(parseDynamicRange(withVideoStream({ colorTrc: "smpte2084" }))).toBe("HDR10");
  });

  it("reads HLG off its own transfer characteristics", () => {
    expect(parseDynamicRange(withVideoStream({ colorTrc: "arib-std-b67" }))).toBe("HLG");
  });

  it("reads HDR10+ off the stream's display title", () => {
    expect(
      parseDynamicRange(withVideoStream({ extendedDisplayTitle: "4K HDR10+ (HEVC Main 10)" })),
    ).toBe("HDR10Plus");
  });

  it("calls a video stream with no HDR signal at all SDR", () => {
    expect(parseDynamicRange(withVideoStream({ colorTrc: "bt709" }))).toBe("SDR");
  });

  it("says nothing rather than SDR when there's no stream to look at", () => {
    expect(parseDynamicRange({ Part: [{ size: 10 }] })).toBeNull();
    expect(parseDynamicRange(undefined)).toBeNull();
  });
});
