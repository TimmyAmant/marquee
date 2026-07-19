import { describe, it, expect } from "vitest";
import { pickOverview } from "./client";

describe("pickOverview", () => {
  it("returns the first entry when translations are present", () => {
    expect(pickOverview(["An overview.", "Une description."])).toBe("An overview.");
  });

  it("returns null for an empty array", () => {
    expect(pickOverview([])).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(pickOverview(undefined)).toBeNull();
  });

  it("returns null rather than an empty string when the first entry is blank", () => {
    expect(pickOverview(["", "A real one."])).toBeNull();
  });
});
