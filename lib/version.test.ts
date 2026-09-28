import { describe, expect, it } from "vitest";
import { compareVersions, parseVersion } from "@/lib/version";

describe("parseVersion", () => {
  it("reads versions with or without a v", () => {
    expect(parseVersion("v0.54.1")).toEqual([0, 54, 1]);
    expect(parseVersion("0.54.1")).toEqual([0, 54, 1]);
    expect(parseVersion(" 0.54.1 ")).toEqual([0, 54, 1]);
  });

  it("rejects what isn't a version", () => {
    expect(parseVersion("latest")).toBeNull();
    expect(parseVersion("nightly")).toBeNull();
    expect(parseVersion("")).toBeNull();
    expect(parseVersion("1..0")).toBeNull();
    expect(parseVersion(null)).toBeNull();
    expect(parseVersion(undefined)).toBeNull();
  });
});

describe("compareVersions", () => {
  it("compares numerically, part by part, not as text", () => {
    expect(compareVersions("0.45.10", "0.45.9")).toBe(1);
    expect(compareVersions("0.45.9", "0.45.10")).toBe(-1);
    expect(compareVersions("0.9.0", "0.10.0")).toBe(-1);
    expect(compareVersions("0.46.0", "0.45.99")).toBe(1);
    expect(compareVersions("v1.0.0", "0.99.99")).toBe(1);
    expect(compareVersions("1.0", "1.0.0")).toBe(0);
    expect(compareVersions("v0.45.3", "0.45.3")).toBe(0);
  });

  it("ignores a pre-release suffix or build metadata", () => {
    expect(compareVersions("0.46.0-beta.1", "0.46.0")).toBe(0);
    expect(compareVersions("0.46.0-beta.1", "0.45.3")).toBe(1);
    expect(compareVersions("0.46.0+abc123", "0.46.0")).toBe(0);
  });

  it("sorts what isn't a version first", () => {
    expect(compareVersions("junk", "0.1.0")).toBe(-1);
    expect(compareVersions("0.1.0", "junk")).toBe(1);
    expect(compareVersions("junk", "latest")).toBe(0);
  });
});
