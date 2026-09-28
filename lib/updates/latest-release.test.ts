import { describe, expect, it } from "vitest";
import { updateStatus } from "./latest-release";

describe("Settings › About's update line", () => {
  it("says whether a newer release is out", () => {
    expect(updateStatus("0.54.0", "v0.55.0")).toEqual({ kind: "available", latest: "0.55.0" });
    expect(updateStatus("0.54.0", "0.54.0")).toEqual({ kind: "current", latest: "0.54.0" });
    // A build ahead of the newest release (a branch) is up to date.
    expect(updateStatus("0.55.0", "0.54.0")).toEqual({ kind: "current", latest: "0.54.0" });
    expect(updateStatus("0.54.0", null)).toEqual({ kind: "unknown" });
    expect(updateStatus("0.54.0", "latest")).toEqual({ kind: "unknown" });
    expect(updateStatus("dev", "0.54.0")).toEqual({ kind: "unknown" });
  });
});
