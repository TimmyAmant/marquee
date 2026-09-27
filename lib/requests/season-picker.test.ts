import { describe, expect, it } from "vitest";
import { allPicked, seasonPill, toggleAllSeasons } from "./season-picker";

describe("the season request dialog", () => {
  it("maps each season's state to Seerr's pills", () => {
    expect(seasonPill("requestable")).toBe("notRequested");
    expect(seasonPill("requested")).toBe("requested");
    expect(seasonPill("complete")).toBe("available");
    expect(seasonPill("monitored")).toBe("monitored");
    expect(seasonPill("unavailable")).toBe("unavailable");
  });

  it("selects every pickable season with the header switch, then none", () => {
    const requestable = [1, 3];
    const all = toggleAllSeasons(new Set([1]), requestable);
    expect([...all]).toEqual([1, 3]);
    expect(allPicked(all, requestable)).toBe(true);
    expect([...toggleAllSeasons(all, requestable)]).toEqual([]);
    expect(allPicked(new Set(), [])).toBe(false);
  });
});
