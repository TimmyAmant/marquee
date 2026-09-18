import { describe, it, expect } from "vitest";
import { parseExternalIds, getFileSize, parseMediaDetail } from "./client";
import type { JellyfinItem } from "./client";

describe("parseExternalIds", () => {
  it("parses tmdb/tvdb/imdb ids from ProviderIds", () => {
    const result = parseExternalIds({
      Id: "1",
      Name: "Test",
      Type: "Movie",
      ProviderIds: { Tmdb: "603", Tvdb: "2288", Imdb: "tt0455275" },
    });
    expect(result).toEqual({ tmdbId: 603, tvdbId: 2288, imdbId: "tt0455275" });
  });

  it("returns nulls when ProviderIds is absent", () => {
    expect(parseExternalIds({ Id: "1", Name: "Test", Type: "Series" })).toEqual({
      tmdbId: null,
      tvdbId: null,
      imdbId: null,
    });
  });

  it("returns nulls for empty-string provider ids rather than NaN", () => {
    const result = parseExternalIds({
      Id: "1",
      Name: "Test",
      Type: "Movie",
      ProviderIds: { Tmdb: "" },
    });
    expect(result.tmdbId).toBeNull();
  });
});

describe("getFileSize", () => {
  it("reads size off the first MediaSources entry", () => {
    expect(getFileSize({ Id: "1", Name: "Test", Type: "Movie", MediaSources: [{ Size: 5000 }] })).toBe(
      5000,
    );
  });

  it("returns null when there are no MediaSources", () => {
    expect(getFileSize({ Id: "1", Name: "Test", Type: "Movie" })).toBeNull();
  });
});

describe("parseMediaDetail", () => {
  const movie = (source: Record<string, unknown>): JellyfinItem => ({
    Id: "1",
    Name: "Test",
    Type: "Movie",
    MediaSources: [source],
  });

  it("reads a 4K Dolby Vision TrueHD Atmos movie off MediaSources", () => {
    const detail = parseMediaDetail(
      movie({
        Size: 61_000_000_000,
        Container: "mkv",
        Bitrate: 58_421_000,
        MediaStreams: [
          {
            Type: "Video",
            Codec: "hevc",
            Width: 3840,
            Height: 1600,
            VideoRange: "HDR",
            VideoRangeType: "DOVIWithHDR10",
          },
          {
            Type: "Audio",
            Codec: "truehd",
            Channels: 8,
            ChannelLayout: "7.1",
            Profile: "Dolby TrueHD + Dolby Atmos",
          },
          { Type: "Subtitle", Codec: "subrip" },
        ],
      }),
    );
    expect(detail).toEqual({
      resolution: "4K",
      videoCodec: "HEVC",
      dynamicRange: "DV",
      audioCodec: "TrueHD Atmos",
      audioChannels: 8,
      container: "MKV",
      bitrateKbps: 58421,
    });
  });

  it("reads a 1080p H.264 AAC movie, SDR and all", () => {
    const detail = parseMediaDetail(
      movie({
        Size: 3_000_000_000,
        Container: "mp4",
        Bitrate: 4_210_000,
        MediaStreams: [
          { Type: "Video", Codec: "h264", Width: 1920, Height: 1080, VideoRangeType: "SDR" },
          { Type: "Audio", Codec: "aac", Channels: 2 },
        ],
      }),
    );
    expect(detail).toEqual({
      resolution: "1080p",
      videoCodec: "H.264",
      dynamicRange: "SDR",
      audioCodec: "AAC",
      audioChannels: 2,
      container: "MP4",
      bitrateKbps: 4210,
    });
  });

  it("falls back to the coarse VideoRange on servers too old for VideoRangeType", () => {
    const detail = parseMediaDetail(
      movie({ MediaStreams: [{ Type: "Video", Codec: "hevc", Width: 3840, Height: 2160, VideoRange: "HDR" }] }),
    );
    expect(detail.dynamicRange).toBe("HDR");
  });

  it("fills in only what a source with no streams has", () => {
    expect(parseMediaDetail(movie({ Size: 900, Container: "avi" }))).toEqual({
      resolution: null,
      videoCodec: null,
      dynamicRange: null,
      audioCodec: null,
      audioChannels: null,
      container: "AVI",
      bitrateKbps: null,
    });
  });

  it("returns every field null for a Series, which carries no MediaSources", () => {
    const detail = parseMediaDetail({ Id: "1", Name: "Test", Type: "Series" });
    expect(Object.values(detail).every((value) => value === null)).toBe(true);
  });
});
