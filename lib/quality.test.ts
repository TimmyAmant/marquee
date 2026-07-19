import { describe, it, expect } from "vitest";
import { resolutionTier } from "./quality";

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
