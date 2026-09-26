// Pure helpers for admin-issued API keys (`mq_…`) — no database import, so
// the format, parsing, hashing and expiry rules are unit tested directly.
// The DB-backed create/list/revoke/authenticate functions live in
// lib/api/api-key-store.ts; what a key may call is lib/api/key-policy.ts.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { ApiKeyScope } from "@/lib/db/schema";

/** Distinct from device tokens' `mqt_`, so one header parse tells them apart. */
export const API_KEY_PREFIX = "mq_";
/** 32 random bytes → 43 base64url characters (no padding). */
const KEY_RANDOM_BYTES = 32;
const KEY_PATTERN = /^mq_[A-Za-z0-9_-]{43}$/;
/** How much of a key is kept in the clear, to tell keys apart in a list. */
const HINT_LENGTH = API_KEY_PREFIX.length + 4;

export const API_KEYS_FORBIDDEN = "Only the admin can manage API keys.";
export const API_KEY_NOT_FOUND = "That API key doesn't exist any more.";
export const API_KEY_NAME_MAX_LENGTH = 80;
/** The longest expiry a key can be given (ten years); null means never. */
export const API_KEY_MAX_EXPIRY_DAYS = 3650;
/** `last_used_at` is written at most this often per key, so a dashboard
 * widget polling every few seconds doesn't turn every read into a write. */
export const API_KEY_TOUCH_INTERVAL_MS = 60 * 1000;

/** Failed key attempts allowed per client address (or the shared
 * "unknown" bucket without TRUSTED_PROXY_HOPS) per window. */
export const API_KEY_FAILURE_LIMIT = 30;
export const API_KEY_FAILURE_WINDOW_MS = 10 * 60 * 1000;

export function generateApiKey(): string {
  return `${API_KEY_PREFIX}${randomBytes(KEY_RANDOM_BYTES).toString("base64url")}`;
}

export function isWellFormedApiKey(key: string): boolean {
  return KEY_PATTERN.test(key);
}

/** SHA-256 hex of the whole key (prefix included). A key is 256 random bits,
 * so a fast hash is enough — only this is ever stored. */
export function hashApiKey(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

/** Constant-time comparison of two hex hashes (the row found by its hash is
 * re-checked this way, so no code path compares secrets with `===`). */
export function hashesMatch(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

/** The first few characters, safe to show: "mq_AbCd". */
export function apiKeyHint(key: string): string {
  return key.slice(0, HINT_LENGTH);
}

export type ApiCredential =
  | { kind: "none" }
  /** An API key header whose value isn't shaped like a key. */
  | { kind: "malformedKey" }
  /** Both an API key and a session token: refused rather than guessing which one counts. */
  | { kind: "conflict" }
  | { kind: "apiKey"; key: string };

/**
 * Finds an API key on a request: `X-Api-Key: mq_…`, or `Authorization:
 * Bearer mq_…` (the scheme case-insensitive). A device token (`Bearer mqt_…`)
 * or no credential at all is `none` — the device-token path handles those.
 * Keys are only ever read from headers, never from the URL.
 */
export function parseApiKeyCredential(headers: Headers): ApiCredential {
  const header = headers.get("x-api-key");
  const authorization = headers.get("authorization");
  if (header !== null) {
    if (authorization !== null && authorization.trim() !== "") return { kind: "conflict" };
    const key = header.trim();
    return isWellFormedApiKey(key) ? { kind: "apiKey", key } : { kind: "malformedKey" };
  }
  if (!authorization) return { kind: "none" };
  const match = /^Bearer[ \t]+(\S+)[ \t]*$/i.exec(authorization.trim());
  if (!match || !match[1].startsWith(API_KEY_PREFIX)) return { kind: "none" };
  return isWellFormedApiKey(match[1]) ? { kind: "apiKey", key: match[1] } : { kind: "malformedKey" };
}

export function isApiKeyExpired(expiresAt: Date | null, now: Date): boolean {
  return expiresAt !== null && expiresAt.getTime() <= now.getTime();
}

export function shouldTouchApiKey(lastUsedAt: Date | null, now: Date): boolean {
  return !lastUsedAt || now.getTime() - lastUsedAt.getTime() >= API_KEY_TOUCH_INTERVAL_MS;
}

export type ApiKeyInput = {
  name: string;
  scope: ApiKeyScope;
  actAsUserId: string | null;
  /** Whole days from now, or null for a key that never expires. */
  expiresInDays: number | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validates a create-key form or body; the error is the text to show. */
export function parseApiKeyInput(body: Record<string, unknown>): { ok: true; input: ApiKeyInput } | { ok: false; error: string } {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return { ok: false, error: "Give the key a name, like Homepage." };
  if (name.length > API_KEY_NAME_MAX_LENGTH) {
    return { ok: false, error: `Keep the name under ${API_KEY_NAME_MAX_LENGTH} characters.` };
  }

  const scope = body.scope;
  if (scope !== "read" && scope !== "full") return { ok: false, error: "Choose read-only or full access." };

  const actAs = body.actAsUserId;
  let actAsUserId: string | null = null;
  if (actAs !== undefined && actAs !== null && actAs !== "") {
    if (typeof actAs !== "string" || !UUID.test(actAs)) return { ok: false, error: "Choose a household member." };
    actAsUserId = actAs.toLowerCase();
  }

  const days = body.expiresInDays;
  let expiresInDays: number | null = null;
  if (days !== undefined && days !== null && days !== "") {
    const value = typeof days === "string" ? Number(days) : days;
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > API_KEY_MAX_EXPIRY_DAYS) {
      return { ok: false, error: `Expiry must be between 1 and ${API_KEY_MAX_EXPIRY_DAYS} days, or never.` };
    }
    expiresInDays = value;
  }

  return { ok: true, input: { name, scope, actAsUserId, expiresInDays } };
}

export function apiKeyExpiresAt(expiresInDays: number | null, now: Date): Date | null {
  return expiresInDays === null ? null : new Date(now.getTime() + expiresInDays * 24 * 60 * 60 * 1000);
}
