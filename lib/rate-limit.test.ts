import { afterEach, describe, expect, it, vi } from "vitest";
import {
  attemptCount,
  consumeRateLimit,
  getClientIp,
  isRateLimited,
  recordFailedAttempt,
  refundAttempt,
  reserveSlot,
} from "./rate-limit";

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

describe("consumeRateLimit", () => {
  it("spends several at once, all or nothing", () => {
    const key = `test:consume:${Math.random()}`;
    expect(consumeRateLimit(key, 3, 5, 60_000)).toBe(true);
    expect(attemptCount(key)).toBe(3);
    expect(consumeRateLimit(key, 3, 5, 60_000)).toBe(false);
    expect(attemptCount(key)).toBe(3);
    expect(consumeRateLimit(key, 2, 5, 60_000)).toBe(true);
    expect(consumeRateLimit(key, 1, 5, 60_000)).toBe(false);
  });
});

describe("reserveSlot / attemptCount", () => {
  it("lets an idle key straight through and queues the next one behind it", () => {
    const key = `test:slot:${Math.random()}`;
    expect(reserveSlot(key, 1000)).toBe(0);
    const wait = reserveSlot(key, 1000);
    expect(wait).toBeGreaterThan(900);
    expect(wait).toBeLessThanOrEqual(1000);
    expect(reserveSlot(key, 1000)).toBeGreaterThan(1900);
  });

  it("doesn't queue anything while the spacing is zero", () => {
    const key = `test:slot-zero:${Math.random()}`;
    expect(reserveSlot(key, 0)).toBe(0);
    expect(reserveSlot(key, 0)).toBe(0);
  });

  it("counts the attempts in the current window", () => {
    const key = `test:count:${Math.random()}`;
    expect(attemptCount(key)).toBe(0);
    recordFailedAttempt(key, 60_000);
    recordFailedAttempt(key, 60_000);
    expect(attemptCount(key)).toBe(2);
  });
});

describe("getClientIp", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("trusts nothing by default, whatever the client sends", () => {
    expect(getClientIp(req({ "x-forwarded-for": "203.0.113.9" }))).toBeNull();
    expect(getClientIp(req({ "x-real-ip": "10.0.0.2" }))).toBeNull();
    expect(getClientIp(req({}))).toBeNull();
  });

  it("ignores a TRUSTED_PROXY_HOPS that isn't a positive integer", () => {
    for (const value of ["", "abc", "-1", "1.5"]) {
      vi.stubEnv("TRUSTED_PROXY_HOPS", value);
      expect(getClientIp(req({ "x-forwarded-for": "203.0.113.9" }))).toBeNull();
    }
  });

  it("with one proxy, uses the entry it appended, not the client-supplied ones before it", () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "1");
    expect(getClientIp(req({ "x-forwarded-for": "1.2.3.4, 203.0.113.9" }))).toBe("203.0.113.9");
    expect(getClientIp(req({ "x-forwarded-for": "203.0.113.9" }))).toBe("203.0.113.9");
  });

  it("with two proxies, skips the inner proxy's own entry", () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "2");
    expect(getClientIp(req({ "x-forwarded-for": "1.2.3.4, 203.0.113.9, 172.17.0.5" }))).toBe("203.0.113.9");
  });

  it("gives up on a header shorter than the configured chain, and never reads X-Real-IP", () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "2");
    expect(getClientIp(req({ "x-forwarded-for": "203.0.113.9" }))).toBeNull();
    vi.stubEnv("TRUSTED_PROXY_HOPS", "1");
    expect(getClientIp(req({ "x-real-ip": "10.0.0.2" }))).toBeNull();
  });

  it("accepts a plain Headers object too (server actions)", () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "1");
    expect(getClientIp(new Headers({ "x-forwarded-for": "203.0.113.9" }))).toBe("203.0.113.9");
  });
});
