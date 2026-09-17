import { describe, it, expect } from "vitest";
import {
  API_TOKEN_SLIDE_INTERVAL_MS,
  API_TOKEN_TTL_MS,
  DEFAULT_DEVICE_NAME,
  computeExpiresAt,
  generateApiToken,
  hashApiToken,
  isTokenExpired,
  isWellFormedApiToken,
  normalizeDeviceName,
  parseBearerToken,
  shouldSlideExpiry,
} from "./tokens";

describe("generateApiToken", () => {
  it("produces mqt_ plus 43 base64url characters", () => {
    const token = generateApiToken();
    expect(token).toMatch(/^mqt_[A-Za-z0-9_-]{43}$/);
    expect(isWellFormedApiToken(token)).toBe(true);
  });

  it("never repeats", () => {
    const tokens = new Set(Array.from({ length: 200 }, () => generateApiToken()));
    expect(tokens.size).toBe(200);
  });
});

describe("hashApiToken", () => {
  it("is SHA-256 hex of the full token", () => {
    // SHA-256 of the ASCII string "mqt_test" (printf 'mqt_test' | shasum -a 256).
    expect(hashApiToken("mqt_test")).toBe("f97e76d743374aef250608081fa449d157c6015341fa47f8d08360f0390d5a31");
  });

  it("is deterministic and distinguishes tokens", () => {
    const a = generateApiToken();
    const b = generateApiToken();
    expect(hashApiToken(a)).toBe(hashApiToken(a));
    expect(hashApiToken(a)).not.toBe(hashApiToken(b));
  });

  it("does not contain the token itself", () => {
    const token = generateApiToken();
    expect(hashApiToken(token)).not.toContain(token.slice(4));
  });
});

describe("parseBearerToken", () => {
  const token = `mqt_${"a".repeat(43)}`;

  it("extracts a well-formed bearer token", () => {
    expect(parseBearerToken(`Bearer ${token}`)).toBe(token);
  });

  it("treats the scheme case-insensitively and tolerates extra whitespace", () => {
    expect(parseBearerToken(`bearer ${token}`)).toBe(token);
    expect(parseBearerToken(`BEARER   ${token}  `)).toBe(token);
  });

  it("rejects a missing or empty header", () => {
    expect(parseBearerToken(null)).toBeNull();
    expect(parseBearerToken(undefined)).toBeNull();
    expect(parseBearerToken("")).toBeNull();
    expect(parseBearerToken("Bearer")).toBeNull();
    expect(parseBearerToken("Bearer ")).toBeNull();
  });

  it("rejects other schemes", () => {
    expect(parseBearerToken(`Basic ${token}`)).toBeNull();
    expect(parseBearerToken(token)).toBeNull();
  });

  it("rejects tokens with the wrong prefix, length or alphabet", () => {
    expect(parseBearerToken(`Bearer xyz_${"a".repeat(43)}`)).toBeNull();
    expect(parseBearerToken(`Bearer mqt_${"a".repeat(42)}`)).toBeNull();
    expect(parseBearerToken(`Bearer mqt_${"a".repeat(44)}`)).toBeNull();
    expect(parseBearerToken(`Bearer mqt_${"a".repeat(42)}=`)).toBeNull();
    expect(parseBearerToken(`Bearer mqt_${"a".repeat(42)}+`)).toBeNull();
  });

  it("rejects more than one credential", () => {
    expect(parseBearerToken(`Bearer ${token} ${token}`)).toBeNull();
  });
});

describe("expiry", () => {
  const now = new Date("2026-09-17T12:00:00.000Z");

  it("expires 90 days after last use", () => {
    expect(API_TOKEN_TTL_MS).toBe(90 * 24 * 60 * 60 * 1000);
    expect(computeExpiresAt(now).toISOString()).toBe("2026-12-16T12:00:00.000Z");
  });

  it("treats the expiry instant itself as expired", () => {
    expect(isTokenExpired(new Date(now.getTime() + 1), now)).toBe(false);
    expect(isTokenExpired(now, now)).toBe(true);
    expect(isTokenExpired(new Date(now.getTime() - 1), now)).toBe(true);
  });
});

describe("shouldSlideExpiry", () => {
  const lastUsedAt = new Date("2026-09-17T12:00:00.000Z");

  it("waits at least an hour between writes", () => {
    expect(API_TOKEN_SLIDE_INTERVAL_MS).toBe(60 * 60 * 1000);
    expect(shouldSlideExpiry(lastUsedAt, lastUsedAt)).toBe(false);
    expect(shouldSlideExpiry(lastUsedAt, new Date(lastUsedAt.getTime() + API_TOKEN_SLIDE_INTERVAL_MS - 1))).toBe(false);
  });

  it("slides once an hour has passed", () => {
    expect(shouldSlideExpiry(lastUsedAt, new Date(lastUsedAt.getTime() + API_TOKEN_SLIDE_INTERVAL_MS))).toBe(true);
    expect(shouldSlideExpiry(lastUsedAt, new Date(lastUsedAt.getTime() + 5 * API_TOKEN_SLIDE_INTERVAL_MS))).toBe(true);
  });

  it("keeps a token in regular use alive indefinitely", () => {
    // Simulate a device used every 30 days for a year: each use after the
    // slide interval pushes expiry out, so it never lapses.
    let lastUsed = lastUsedAt;
    let expiresAt = computeExpiresAt(lastUsed);
    for (let i = 1; i <= 12; i++) {
      const useAt = new Date(lastUsedAt.getTime() + i * 30 * 24 * 60 * 60 * 1000);
      expect(isTokenExpired(expiresAt, useAt)).toBe(false);
      if (shouldSlideExpiry(lastUsed, useAt)) {
        lastUsed = useAt;
        expiresAt = computeExpiresAt(useAt);
      }
    }
  });
});

describe("normalizeDeviceName", () => {
  it("trims and caps the name", () => {
    expect(normalizeDeviceName("  Timmy's MacBook Pro ")).toBe("Timmy's MacBook Pro");
    expect(normalizeDeviceName("x".repeat(300))).toHaveLength(100);
  });

  it("falls back for missing, blank or non-string names", () => {
    expect(normalizeDeviceName(undefined)).toBe(DEFAULT_DEVICE_NAME);
    expect(normalizeDeviceName("   ")).toBe(DEFAULT_DEVICE_NAME);
    expect(normalizeDeviceName(42)).toBe(DEFAULT_DEVICE_NAME);
  });
});
