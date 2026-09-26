import { describe, expect, it } from "vitest";
import {
  apiKeyExpiresAt,
  apiKeyHint,
  generateApiKey,
  hashApiKey,
  hashesMatch,
  isApiKeyExpired,
  isWellFormedApiKey,
  parseApiKeyCredential,
  parseApiKeyInput,
  shouldTouchApiKey,
} from "@/lib/api/api-keys";

const KEY = "mq_" + "A".repeat(43);
const TOKEN = "mqt_" + "B".repeat(43);

describe("API key format", () => {
  it("generates distinct, well-formed keys with the mq_ prefix", () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a).toMatch(/^mq_[A-Za-z0-9_-]{43}$/);
    expect(isWellFormedApiKey(a)).toBe(true);
    expect(a).not.toBe(b);
  });

  it("isn't fooled by device tokens or junk", () => {
    expect(isWellFormedApiKey(TOKEN)).toBe(false);
    expect(isWellFormedApiKey("mq_short")).toBe(false);
    expect(isWellFormedApiKey(KEY + "x")).toBe(false);
    expect(isWellFormedApiKey(`${KEY}\n`)).toBe(false);
  });

  it("hashes with SHA-256 and compares in constant time", () => {
    expect(hashApiKey(KEY)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashApiKey(KEY)).not.toBe(hashApiKey(generateApiKey()));
    expect(hashesMatch(hashApiKey(KEY), hashApiKey(KEY))).toBe(true);
    expect(hashesMatch(hashApiKey(KEY), hashApiKey(TOKEN))).toBe(false);
    expect(hashesMatch("abc", "abcd")).toBe(false);
  });

  it("keeps only a short hint in the clear", () => {
    expect(apiKeyHint(KEY)).toBe("mq_AAAA");
  });
});

describe("parseApiKeyCredential", () => {
  const headers = (init: Record<string, string>) => new Headers(init);

  it("reads X-Api-Key", () => {
    expect(parseApiKeyCredential(headers({ "x-api-key": ` ${KEY} ` }))).toEqual({ kind: "apiKey", key: KEY });
  });

  it("reads Authorization: Bearer mq_…, any case", () => {
    expect(parseApiKeyCredential(headers({ authorization: `bearer ${KEY}` }))).toEqual({ kind: "apiKey", key: KEY });
  });

  it("leaves device tokens and missing credentials to the token path", () => {
    expect(parseApiKeyCredential(headers({ authorization: `Bearer ${TOKEN}` }))).toEqual({ kind: "none" });
    expect(parseApiKeyCredential(headers({}))).toEqual({ kind: "none" });
    expect(parseApiKeyCredential(headers({ authorization: "Basic abc" }))).toEqual({ kind: "none" });
  });

  it("flags a malformed key rather than ignoring it", () => {
    expect(parseApiKeyCredential(headers({ "x-api-key": "nope" }))).toEqual({ kind: "malformedKey" });
    expect(parseApiKeyCredential(headers({ "x-api-key": "" }))).toEqual({ kind: "malformedKey" });
    expect(parseApiKeyCredential(headers({ authorization: "Bearer mq_short" }))).toEqual({ kind: "malformedKey" });
  });

  it("refuses a key and a token together", () => {
    expect(parseApiKeyCredential(headers({ "x-api-key": KEY, authorization: `Bearer ${TOKEN}` }))).toEqual({
      kind: "conflict",
    });
  });
});

describe("expiry and last use", () => {
  const now = new Date("2026-09-26T12:00:00Z");

  it("never expires without a date, and expires at it", () => {
    expect(isApiKeyExpired(null, now)).toBe(false);
    expect(isApiKeyExpired(new Date("2026-09-26T12:00:01Z"), now)).toBe(false);
    expect(isApiKeyExpired(now, now)).toBe(true);
  });

  it("computes expiry in whole days", () => {
    expect(apiKeyExpiresAt(null, now)).toBeNull();
    expect(apiKeyExpiresAt(30, now)?.toISOString()).toBe("2026-10-26T12:00:00.000Z");
  });

  it("records last use at most once a minute", () => {
    expect(shouldTouchApiKey(null, now)).toBe(true);
    expect(shouldTouchApiKey(new Date(now.getTime() - 30_000), now)).toBe(false);
    expect(shouldTouchApiKey(new Date(now.getTime() - 60_000), now)).toBe(true);
  });
});

describe("parseApiKeyInput", () => {
  it("accepts a named read-only key that never expires", () => {
    expect(parseApiKeyInput({ name: "  Homepage ", scope: "read" })).toEqual({
      ok: true,
      input: { name: "Homepage", scope: "read", actAsUserId: null, expiresInDays: null },
    });
  });

  it("accepts a member to act as and an expiry", () => {
    const id = "83C55A49-6153-4CB9-AE22-4A42D48F4CF3";
    expect(parseApiKeyInput({ name: "Phone", scope: "full", actAsUserId: id, expiresInDays: "90" })).toEqual({
      ok: true,
      input: { name: "Phone", scope: "full", actAsUserId: id.toLowerCase(), expiresInDays: 90 },
    });
  });

  it.each([
    [{ scope: "read" }, "Give the key a name, like Homepage."],
    [{ name: "x".repeat(81), scope: "read" }, "Keep the name under 80 characters."],
    [{ name: "x", scope: "admin" }, "Choose read-only or full access."],
    [{ name: "x", scope: "full", actAsUserId: "bob" }, "Choose a household member."],
    [{ name: "x", scope: "full", expiresInDays: 0 }, "Expiry must be between 1 and 3650 days, or never."],
    [{ name: "x", scope: "full", expiresInDays: 1.5 }, "Expiry must be between 1 and 3650 days, or never."],
  ])("refuses %j", (body, error) => {
    expect(parseApiKeyInput(body)).toEqual({ ok: false, error });
  });
});
