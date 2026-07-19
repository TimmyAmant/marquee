import { describe, it, expect } from "vitest";
import { resolutionTier, hdrLabel, audioLabel } from "./quality";

describe("resolutionTier", () => {
  it("detects 4K from 2160p", () => {
    expect(resolutionTier("WEBDL-2160p")).toBe("4K");
  });

  it("detects 4K from the literal '4K' string", () => {
    expect(resolutionTier("Bluray-4K")).toBe("4K");
  });

  it("detects 1080p", () => {
    expect(resolutionTier("Bluray-1080p")).toBe("1080p");
  });

  it("detects 720p", () => {
    expect(resolutionTier("HDTV-720p")).toBe("720p");
  });

  it("returns null for SD/unrecognized quality names", () => {
    expect(resolutionTier("SDTV")).toBeNull();
    expect(resolutionTier("DVD")).toBeNull();
  });

  it("returns null for null/undefined input", () => {
    expect(resolutionTier(null)).toBeNull();
    expect(resolutionTier(undefined)).toBeNull();
  });

  it("is case-insensitive", () => {
    expect(resolutionTier("bluray-1080P")).toBe("1080p");
  });
});

describe("hdrLabel", () => {
  it("expands 'DV' to 'Dolby Vision'", () => {
    expect(hdrLabel("DV")).toBe("Dolby Vision");
  });

  it("formats 'HDR10Plus' as 'HDR10+'", () => {
    expect(hdrLabel("HDR10Plus")).toBe("HDR10+");
  });

  it("passes plain HDR10 through unchanged", () => {
    expect(hdrLabel("HDR10")).toBe("HDR10");
  });

  it("returns null for missing/empty input", () => {
    expect(hdrLabel(null)).toBeNull();
    expect(hdrLabel(undefined)).toBeNull();
    expect(hdrLabel("")).toBeNull();
  });
});

describe("audioLabel", () => {
  it("shortens any codec string containing 'Atmos' to just 'Atmos'", () => {
    expect(audioLabel("TrueHD Atmos")).toBe("Atmos");
    expect(audioLabel("DD+ Atmos")).toBe("Atmos");
  });

  it("passes a plain codec name through unchanged", () => {
    expect(audioLabel("DTS-HD MA")).toBe("DTS-HD MA");
  });

  it("returns null for missing/empty input", () => {
    expect(audioLabel(null)).toBeNull();
    expect(audioLabel(undefined)).toBeNull();
    expect(audioLabel("")).toBeNull();
  });
});
