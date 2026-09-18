import { describe, it, expect } from "vitest";
import {
  aggregateMediaDetail,
  EMPTY_MEDIA_DETAIL,
  hasAtmos,
  isEmptyMediaDetail,
  mergeMediaDetail,
  normalizeAudioCodec,
  normalizeBitrateKbps,
  normalizeChannels,
  normalizeContainer,
  normalizeDynamicRange,
  normalizeResolution,
  normalizeVideoCodec,
} from "./media-info";

describe("normalizeResolution", () => {
  it("normalizes Plex's labels to the tiers resolutionTier matches", () => {
    expect(normalizeResolution("4k")).toBe("4K");
    expect(normalizeResolution("1080")).toBe("1080p");
    expect(normalizeResolution("720")).toBe("720p");
    expect(normalizeResolution("480")).toBe("480p");
    expect(normalizeResolution("sd")).toBe("SD");
  });

  it("derives a tier from Jellyfin's pixel dimensions", () => {
    expect(normalizeResolution(null, 3840, 2160)).toBe("4K");
    // A scope-ratio 4K file is only 1600 tall — width has to decide it.
    expect(normalizeResolution(null, 3840, 1600)).toBe("4K");
    expect(normalizeResolution(null, 1920, 1080)).toBe("1080p");
    expect(normalizeResolution(null, 1280, 720)).toBe("720p");
  });

  it("keeps a raw WxH when the dimensions don't land on a tier", () => {
    expect(normalizeResolution(null, 720, 306)).toBe("720x306");
    expect(normalizeResolution("1920x816")).toBe("1920x816");
  });

  it("returns null when neither a label nor dimensions are given", () => {
    expect(normalizeResolution()).toBeNull();
    expect(normalizeResolution("", null, null)).toBeNull();
    expect(normalizeResolution(null, 0, 0)).toBeNull();
  });
});

describe("normalizeVideoCodec", () => {
  it("gives every spelling of a codec one name", () => {
    expect(normalizeVideoCodec("hevc")).toBe("HEVC");
    expect(normalizeVideoCodec("h265")).toBe("HEVC");
    expect(normalizeVideoCodec("h264")).toBe("H.264");
    expect(normalizeVideoCodec("AVC")).toBe("H.264");
    expect(normalizeVideoCodec("av1")).toBe("AV1");
    expect(normalizeVideoCodec("mpeg2video")).toBe("MPEG-2");
  });

  it("passes an unknown codec through rather than dropping it", () => {
    expect(normalizeVideoCodec("prores")).toBe("PRORES");
  });

  it("returns null for nothing", () => {
    expect(normalizeVideoCodec(null)).toBeNull();
    expect(normalizeVideoCodec("  ")).toBeNull();
  });
});

describe("normalizeAudioCodec", () => {
  it("spells codecs the way Radarr's mediaInfo does", () => {
    expect(normalizeAudioCodec("truehd")).toBe("TrueHD");
    expect(normalizeAudioCodec("eac3")).toBe("EAC3");
    expect(normalizeAudioCodec("dca")).toBe("DTS");
    expect(normalizeAudioCodec("aac")).toBe("AAC");
    expect(normalizeAudioCodec("pcm_s24le")).toBe("PCM");
  });

  it("appends Atmos so audioLabel finds it, as Radarr's string does", () => {
    expect(normalizeAudioCodec("truehd", { atmos: true })).toBe("TrueHD Atmos");
    expect(normalizeAudioCodec("eac3", { atmos: true })).toBe("EAC3 Atmos");
  });

  it("promotes DTS to its profile's name", () => {
    expect(normalizeAudioCodec("dca", { profile: "ma" })).toBe("DTS-HD MA");
    expect(normalizeAudioCodec("dts", { profile: "DTS-HD MA" })).toBe("DTS-HD MA");
    expect(normalizeAudioCodec("dts", { profile: "hra" })).toBe("DTS-HD HRA");
  });

  it("returns null when the provider didn't say", () => {
    expect(normalizeAudioCodec(undefined, { atmos: true })).toBeNull();
  });
});

describe("hasAtmos", () => {
  it("finds Atmos in any of the strings a provider might put it in", () => {
    expect(hasAtmos("Dolby TrueHD + Dolby Atmos")).toBe(true);
    expect(hasAtmos(null, undefined, "TrueHD Atmos 7.1")).toBe(true);
    // Plex reports an EAC3 Atmos track's profile as Joint Object Coding.
    expect(hasAtmos("joc")).toBe(true);
  });

  it("is false for an ordinary track", () => {
    expect(hasAtmos("ma", "DTS-HD MA 5.1", null)).toBe(false);
    expect(hasAtmos()).toBe(false);
  });
});

describe("normalizeDynamicRange", () => {
  it("normalizes both providers' spellings onto Radarr's", () => {
    expect(normalizeDynamicRange("DOVI")).toBe("DV");
    expect(normalizeDynamicRange("DOVIWithHDR10")).toBe("DV");
    expect(normalizeDynamicRange("Dolby Vision")).toBe("DV");
    expect(normalizeDynamicRange("HDR10Plus")).toBe("HDR10Plus");
    expect(normalizeDynamicRange("hdr10+")).toBe("HDR10Plus");
    expect(normalizeDynamicRange("HDR10")).toBe("HDR10");
    expect(normalizeDynamicRange("HLG")).toBe("HLG");
    expect(normalizeDynamicRange("SDR")).toBe("SDR");
  });

  it("returns null when it isn't reported", () => {
    expect(normalizeDynamicRange(null)).toBeNull();
    expect(normalizeDynamicRange("")).toBeNull();
  });
});

describe("normalizeContainer", () => {
  it("uppercases and resolves ffmpeg's aliases", () => {
    expect(normalizeContainer("mkv")).toBe("MKV");
    expect(normalizeContainer("matroska")).toBe("MKV");
    expect(normalizeContainer(".mp4")).toBe("MP4");
    expect(normalizeContainer("mpegts")).toBe("TS");
  });

  it("returns null for nothing", () => {
    expect(normalizeContainer(undefined)).toBeNull();
  });
});

describe("normalizeBitrateKbps", () => {
  it("keeps Plex's kbps and converts Jellyfin's bps", () => {
    expect(normalizeBitrateKbps(58421, "kbps")).toBe(58421);
    expect(normalizeBitrateKbps(58421000, "bps")).toBe(58421);
  });

  it("rejects zero, negatives and nothing at all", () => {
    expect(normalizeBitrateKbps(0, "kbps")).toBeNull();
    expect(normalizeBitrateKbps(-5, "kbps")).toBeNull();
    expect(normalizeBitrateKbps(null, "bps")).toBeNull();
    // Under 1 kbps in bps rounds to nothing rather than to 0.
    expect(normalizeBitrateKbps(400, "bps")).toBeNull();
  });
});

describe("normalizeChannels", () => {
  it("takes a positive channel count only", () => {
    expect(normalizeChannels(8)).toBe(8);
    expect(normalizeChannels(0)).toBeNull();
    expect(normalizeChannels(undefined)).toBeNull();
  });
});

describe("mergeMediaDetail", () => {
  it("fills the primary's gaps from the fallback without overwriting it", () => {
    const merged = mergeMediaDetail(
      { ...EMPTY_MEDIA_DETAIL, resolution: "4K", videoCodec: "HEVC" },
      { ...EMPTY_MEDIA_DETAIL, resolution: "1080p", dynamicRange: "DV", container: "MKV" },
    );
    expect(merged.resolution).toBe("4K");
    expect(merged.videoCodec).toBe("HEVC");
    expect(merged.dynamicRange).toBe("DV");
    expect(merged.container).toBe("MKV");
  });
});

describe("aggregateMediaDetail", () => {
  it("takes the most common value per field and the mean bitrate", () => {
    const detail = aggregateMediaDetail([
      { ...EMPTY_MEDIA_DETAIL, resolution: "1080p", videoCodec: "H.264", container: "MKV", bitrateKbps: 4000 },
      { ...EMPTY_MEDIA_DETAIL, resolution: "1080p", videoCodec: "H.264", container: "MKV", bitrateKbps: 6000 },
      { ...EMPTY_MEDIA_DETAIL, resolution: "720p", videoCodec: "HEVC", container: "MP4", bitrateKbps: 2000 },
    ]);
    expect(detail.resolution).toBe("1080p");
    expect(detail.videoCodec).toBe("H.264");
    expect(detail.container).toBe("MKV");
    expect(detail.bitrateKbps).toBe(4000);
  });

  it("ignores fields no episode reported", () => {
    const detail = aggregateMediaDetail([
      { ...EMPTY_MEDIA_DETAIL, resolution: "1080p" },
      { ...EMPTY_MEDIA_DETAIL, resolution: null, audioCodec: "AAC" },
    ]);
    expect(detail.resolution).toBe("1080p");
    expect(detail.audioCodec).toBe("AAC");
    expect(detail.dynamicRange).toBeNull();
    expect(detail.bitrateKbps).toBeNull();
  });

  it("is empty for a show with no episodes", () => {
    expect(isEmptyMediaDetail(aggregateMediaDetail([]))).toBe(true);
  });
});
