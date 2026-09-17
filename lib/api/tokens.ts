// Pure token helpers for the /api/v1 bearer-token scheme — no database import,
// so the format/hashing/expiry rules can be unit tested directly. The
// DB-backed issue/lookup/revoke functions live in lib/api/auth.ts.
import { createHash, randomBytes } from "node:crypto";

export const API_TOKEN_PREFIX = "mqt_";
/** 32 random bytes → 43 base64url characters (no padding). */
const TOKEN_RANDOM_BYTES = 32;
const TOKEN_BODY_LENGTH = 43;
const TOKEN_PATTERN = /^mqt_[A-Za-z0-9_-]{43}$/;

/** A token expires this long after it was last used. */
export const API_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;
/** `last_used_at`/`expires_at` are written at most this often per token, so a
 * client polling every few seconds doesn't turn every read into a write. */
export const API_TOKEN_SLIDE_INTERVAL_MS = 60 * 60 * 1000;

export const DEVICE_NAME_MAX_LENGTH = 100;
export const DEFAULT_DEVICE_NAME = "Unnamed device";

export function generateApiToken(): string {
  const body = randomBytes(TOKEN_RANDOM_BYTES).toString("base64url");
  return `${API_TOKEN_PREFIX}${body}`;
}

export function isWellFormedApiToken(token: string): boolean {
  return token.length === API_TOKEN_PREFIX.length + TOKEN_BODY_LENGTH && TOKEN_PATTERN.test(token);
}

/** SHA-256 hex of the full token string (prefix included). Only this is ever
 * stored — a leaked database dump can't be replayed as bearer tokens. */
export function hashApiToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Extracts the token from an `Authorization: Bearer mqt_…` header. The scheme
 * name is case-insensitive per RFC 7235; anything malformed returns null. */
export function parseBearerToken(header: string | null | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer[ \t]+(\S+)[ \t]*$/i.exec(header.trim());
  if (!match) return null;
  const token = match[1];
  return isWellFormedApiToken(token) ? token : null;
}

export function computeExpiresAt(lastUsedAt: Date): Date {
  return new Date(lastUsedAt.getTime() + API_TOKEN_TTL_MS);
}

export function isTokenExpired(expiresAt: Date, now: Date): boolean {
  return expiresAt.getTime() <= now.getTime();
}

/** True when enough time has passed since the last recorded use that this
 * request should push `last_used_at`/`expires_at` forward. */
export function shouldSlideExpiry(lastUsedAt: Date, now: Date): boolean {
  return now.getTime() - lastUsedAt.getTime() >= API_TOKEN_SLIDE_INTERVAL_MS;
}

/** Trims and caps a client-supplied device name, falling back to a generic
 * label when it's missing or blank. */
export function normalizeDeviceName(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_DEVICE_NAME;
  const trimmed = value.trim();
  if (!trimmed) return DEFAULT_DEVICE_NAME;
  return trimmed.slice(0, DEVICE_NAME_MAX_LENGTH);
}
