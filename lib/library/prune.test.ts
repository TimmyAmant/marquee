import { describe, expect, it } from "vitest";
import { rowsMissingFromSync } from "./prune";

describe("rowsMissingFromSync", () => {
  it("returns only rows the sync didn't see", () => {
    const stored = [
      { id: "a", key: "1" },
      { id: "b", key: "2" },
      { id: "c", key: "3" },
    ];
    expect(rowsMissingFromSync(stored, new Set(["1", "3"]))).toEqual(["b"]);
  });

  it("keeps everything when everything was seen", () => {
    expect(rowsMissingFromSync([{ id: "a", key: "1" }], new Set(["1"]))).toEqual([]);
  });
});
