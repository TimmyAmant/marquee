import { describe, expect, it } from "vitest";
import { getClientIp, isRateLimited, recordFailedAttempt, refundAttempt } from "./rate-limit";

const req = (headers: Record<string, string>) => new Request("http://marquee.local/", { headers });

describe("recordFailedAttempt / refundAttempt", () => {
  it("counts attempts recorded up front and gives one back on refund", () => {
    const key = `test:refund:${Math.random()}`;
    recordFailedAttempt(key, 60_000);
    recordFailedAttempt(key, 60_000);
    expect(isRateLimited(key, 2)).toBe(true);
    refundAttempt(key);
    expect(isRateLimited(key, 2)).toBe(false);
  });

  it("never refunds below zero or into an unknown bucket", () => {
    const key = `test:refund-empty:${Math.random()}`;
    refundAttempt(key);
    expect(isRateLimited(key, 1)).toBe(false);
    recordFailedAttempt(key, 60_000);
    refundAttempt(key);
    refundAttempt(key);
    expect(isRateLimited(key, 1)).toBe(false);
  });
});

describe("getClientIp", () => {
  it("uses the hop the nearest proxy appended, not the client-supplied first one", () => {
    expect(getClientIp(req({ "x-forwarded-for": "1.2.3.4, 203.0.113.9" }))).toBe("203.0.113.9");
  });

  it("handles a single hop", () => {
    expect(getClientIp(req({ "x-forwarded-for": "203.0.113.9" }))).toBe("203.0.113.9");
  });

  it("falls back to X-Real-IP, then unknown", () => {
    expect(getClientIp(req({ "x-real-ip": "10.0.0.2" }))).toBe("10.0.0.2");
    expect(getClientIp(req({}))).toBe("unknown");
  });
});
