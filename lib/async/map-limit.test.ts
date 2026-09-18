import { describe, expect, it } from "vitest";
import { mapWithLimit } from "./map-limit";

describe("mapWithLimit", () => {
  it("keeps input order", async () => {
    const out = await mapWithLimit([30, 10, 20], 2, async (ms) => {
      await new Promise((r) => setTimeout(r, ms));
      return ms;
    });
    expect(out).toEqual([30, 10, 20]);
  });

  it("never exceeds the limit", async () => {
    let active = 0;
    let peak = 0;
    await mapWithLimit(Array.from({ length: 20 }, (_, i) => i), 4, async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 2));
      active--;
    });
    expect(peak).toBe(4);
  });

  it("handles an empty list", async () => {
    expect(await mapWithLimit([], 4, async () => 1)).toEqual([]);
  });
});
