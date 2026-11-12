import { describe, it, expect } from "vitest";
import { isStale, isIncomplete, isCacheHit, isActiveTitle, TTL_MS, INCOMPLETE_RETRY_WINDOW_MS } from "./cache-policy";

const complete = { posterPath: "/poster.jpg", backdropPath: "/backdrop.jpg", overview: "A story." };

describe("isStale", () => {
  it("is not stale immediately after refreshing", () => {
    expect(isStale(new Date())).toBe(false);
  });

  it("is stale once older than the TTL", () => {
    expect(isStale(new Date(Date.now() - TTL_MS - 1000))).toBe(true);
  });

  it("is not stale just under the TTL", () => {
    expect(isStale(new Date(Date.now() - TTL_MS + 1000))).toBe(false);
  });
});

describe("isIncomplete", () => {
  it("is false when poster, backdrop, and overview are all present", () => {
    expect(isIncomplete(complete)).toBe(false);
  });

  it("is true when the poster is missing", () => {
    expect(isIncomplete({ ...complete, posterPath: null })).toBe(true);
  });

  it("is true when the backdrop is missing", () => {
    expect(isIncomplete({ ...complete, backdropPath: null })).toBe(true);
  });

  it("is true when the overview is missing", () => {
    expect(isIncomplete({ ...complete, overview: null })).toBe(true);
  });
});

describe("isCacheHit", () => {
  it("is a miss when there's no rawTmdb at all, regardless of completeness", () => {
    expect(isCacheHit({ ...complete, refreshedAt: new Date() }, false)).toBe(false);
  });

  it("is a hit for a complete, fresh row", () => {
    expect(isCacheHit({ ...complete, refreshedAt: new Date() }, true)).toBe(true);
  });

  it("is a miss for a stale row even if complete", () => {
    expect(isCacheHit({ ...complete, refreshedAt: new Date(Date.now() - TTL_MS - 1000) }, true)).toBe(
      false,
    );
  });

  it("is a miss for an incomplete row within the aggressive-retry window", () => {
    expect(
      isCacheHit(
        { ...complete, posterPath: null, refreshedAt: new Date(Date.now() - 1000) },
        true,
      ),
    ).toBe(false);
  });

  it("is a hit for an incomplete row once past the retry window (but still under the full TTL) — this is the exact fix for the permanent-refetch-loop bug", () => {
    expect(
      isCacheHit(
        {
          ...complete,
          posterPath: null,
          refreshedAt: new Date(Date.now() - INCOMPLETE_RETRY_WINDOW_MS - 1000),
        },
        true,
      ),
    ).toBe(true);
  });
});

describe("active titles", () => {
  const day = 24 * 60 * 60 * 1000;
  const complete = { posterPath: "/p.jpg", backdropPath: "/b.jpg", overview: "x" };

  it("re-reads a show on the air or a fresh movie after a day, an old one after two weeks", () => {
    expect(isActiveTitle({ status: "Returning Series" })).toBe(true);
    expect(isActiveTitle({ status: "Ended", last_air_date: "2010-01-01" })).toBe(false);
    expect(isActiveTitle({ status: "Released", release_date: new Date(Date.now() - 10 * day).toISOString().slice(0, 10) })).toBe(true);
    expect(isActiveTitle({ status: "Post Production" })).toBe(true);
    const twoDaysOld = new Date(Date.now() - 2 * day);
    expect(isCacheHit({ ...complete, refreshedAt: twoDaysOld, active: true }, true)).toBe(false);
    expect(isCacheHit({ ...complete, refreshedAt: twoDaysOld, active: false }, true)).toBe(true);
  });
});
