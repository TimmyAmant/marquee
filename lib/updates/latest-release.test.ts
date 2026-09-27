import { describe, expect, it } from "vitest";
import { compareVersions, parseVersion, updateStatus } from "./latest-release";

describe("Settings › About's update line", () => {
  it("reads versions with or without a v", () => {
    expect(parseVersion("v0.54.1")).toEqual([0, 54, 1]);
    expect(parseVersion("0.54.1")).toEqual([0, 54, 1]);
    expect(parseVersion("nightly")).toBeNull();
    expect(parseVersion(null)).toBeNull();
  });

  it("compares by number, not text", () => {
    expect(compareVersions("0.9.0", "0.10.0")).toBeLessThan(0);
    expect(compareVersions("v1.0.0", "0.99.99")).toBeGreaterThan(0);
    expect(compareVersions("0.54.0", "v0.54.0")).toBe(0);
    expect(compareVersions("0.54.0", "latest")).toBeNull();
  });

  it("says whether a newer release is out", () => {
    expect(updateStatus("0.54.0", "v0.55.0")).toEqual({ kind: "available", latest: "0.55.0" });
    expect(updateStatus("0.54.0", "0.54.0")).toEqual({ kind: "current", latest: "0.54.0" });
    // A build ahead of the newest release (a branch) is up to date.
    expect(updateStatus("0.55.0", "0.54.0")).toEqual({ kind: "current", latest: "0.54.0" });
    expect(updateStatus("0.54.0", null)).toEqual({ kind: "unknown" });
  });
});
