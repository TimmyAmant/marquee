import { describe, expect, it } from "vitest";
import { clampShift } from "./viewport-clamp";

describe("clampShift", () => {
  it("leaves a popover that fits alone", () => {
    expect(clampShift(20, 320, 390)).toBe(0);
  });
  it("pushes one past the left edge back in", () => {
    expect(clampShift(-120, 180, 390)).toBe(128);
  });
  it("pulls one past the right edge back in", () => {
    expect(clampShift(200, 500, 390)).toBe(-118);
  });
  it("keeps the left margin when it is wider than the window", () => {
    expect(clampShift(100, 500, 390)).toBe(-92);
  });
});
