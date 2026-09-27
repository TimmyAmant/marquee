import { describe, expect, it } from "vitest";
import { parseRailLabels, parseRailPosition, railLabelsCookie, railPositionCookie, RAIL_POSITIONS } from "@/lib/rail-position";

describe("parseRailPosition", () => {
  it("accepts every position", () => {
    for (const position of RAIL_POSITIONS) expect(parseRailPosition(position)).toBe(position);
  });

  it("tolerates case and whitespace", () => {
    expect(parseRailPosition(" Bottom ")).toBe("bottom");
    expect(parseRailPosition("RIGHT")).toBe("right");
  });

  it("falls back to left when missing", () => {
    expect(parseRailPosition(undefined)).toBe("left");
    expect(parseRailPosition(null)).toBe("left");
    expect(parseRailPosition("")).toBe("left");
  });

  it("falls back to left on garbage", () => {
    expect(parseRailPosition("middle")).toBe("left");
    expect(parseRailPosition("top; Path=/")).toBe("left");
    expect(parseRailPosition("constructor")).toBe("left");
  });
});

describe("railPositionCookie", () => {
  it("writes a site-wide, year-long cookie", () => {
    expect(railPositionCookie("top")).toBe("marquee-rail=top; Path=/; Max-Age=31536000; SameSite=Lax");
  });
});

describe("menu labels", () => {
  it("is on only for \"on\"", () => {
    expect(parseRailLabels("on")).toBe(true);
    expect(parseRailLabels(" ON ")).toBe(true);
    expect(parseRailLabels("off")).toBe(false);
    expect(parseRailLabels(undefined)).toBe(false);
    expect(parseRailLabels("yes")).toBe(false);
  });

  it("keeps the choice for a year", () => {
    expect(railLabelsCookie(true)).toBe("marquee-rail-labels=on; Path=/; Max-Age=31536000; SameSite=Lax");
    expect(railLabelsCookie(false)).toContain("marquee-rail-labels=off");
  });
});
