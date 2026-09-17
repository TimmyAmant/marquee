import { describe, it, expect } from "vitest";
import { discoverBatchSize, discoverHasNextPage, discoverTotalPages } from "./paging";

describe("discover paging", () => {
  it("uses bigger batches when hiding owned titles", () => {
    expect(discoverBatchSize(false)).toBe(4);
    expect(discoverBatchSize(true)).toBe(10);
  });

  it("caps at TMDb's 500-page limit", () => {
    expect(discoverTotalPages(10_000, false)).toBe(125);
    expect(discoverTotalPages(10_000, true)).toBe(50);
  });

  it("never reports fewer than one page", () => {
    expect(discoverTotalPages(0, false)).toBe(1);
    expect(discoverTotalPages(1, true)).toBe(1);
  });

  it("agrees with the infinite-scroll hasNextPage condition", () => {
    for (const hideOwned of [false, true]) {
      for (const tmdbPages of [1, 3, 4, 5, 8, 9, 10, 11, 40, 41, 499, 500, 501, 9000]) {
        const total = discoverTotalPages(tmdbPages, hideOwned);
        for (let page = 1; page <= total + 1; page++) {
          expect(discoverHasNextPage(page, tmdbPages, hideOwned)).toBe(page < total);
        }
      }
    }
  });
});
