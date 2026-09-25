// Request parsing helpers for /api/v1 handlers. Every failure throws an
// ApiError(400 invalid) with a message that's safe to show in the UI.
import { ApiError } from "@/lib/api/errors";
import {
  arrProviderValues,
  favoriteEntityTypeValues,
  integrationProviderValues,
  mediaTypeValues,
  type ArrProvider,
  type FavoriteEntityType,
  type IntegrationProvider,
  type MediaType,
} from "@/lib/db/schema";

export function invalid(message: string): ApiError {
  return ApiError.of("invalid", message);
}

/** Every JSON body the API takes is a handful of fields; this is far more
 * than any of them needs. */
export const MAX_JSON_BODY_BYTES = 64 * 1024;

function bodyTooLarge(): ApiError {
  return new ApiError(413, "invalid", "Request body is too large.");
}

/** Reads the body as text without holding more than MAX_JSON_BODY_BYTES in
 * memory — some callers (sign-in, first-run setup) take requests from
 * anyone. A declared Content-Length over the limit is refused up front, and
 * a body that turns out longer anyway is cut off as soon as it crosses it
 * (the same approach as readAvatarUpload). */
async function readBodyText(request: Request): Promise<string> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_JSON_BODY_BYTES) throw bodyTooLarge();
  if (!request.body) return "";

  const decoder = new TextDecoder();
  let text = "";
  let total = 0;
  const reader = request.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_JSON_BODY_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw bodyTooLarge();
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

/** Parses a JSON object body. An empty body is treated as `{}` so action
 * endpoints that take no parameters work with or without one. Over
 * MAX_JSON_BODY_BYTES is a 413. */
export async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  const text = await readBodyText(request);
  if (!text.trim()) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw invalid("Request body isn't valid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw invalid("Request body must be a JSON object.");
  }
  return parsed as Record<string, unknown>;
}

export function optionalString(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw invalid(`"${key}" must be a string.`);
  return value;
}

export function requiredString(body: Record<string, unknown>, key: string): string {
  const value = optionalString(body, key);
  if (value === undefined) throw invalid(`"${key}" is required.`);
  return value;
}

export function optionalBoolean(body: Record<string, unknown>, key: string): boolean | undefined {
  const value = body[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "boolean") throw invalid(`"${key}" must be true or false.`);
  return value;
}

export function requiredBoolean(body: Record<string, unknown>, key: string): boolean {
  const value = optionalBoolean(body, key);
  if (value === undefined) throw invalid(`"${key}" is required.`);
  return value;
}

export function optionalNumberish(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key];
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string") return value;
  throw invalid(`"${key}" must be a number or a string.`);
}

function isOneOf<T extends string>(values: readonly T[], value: string): value is T {
  return (values as readonly string[]).includes(value);
}

export function parseMediaType(value: string): MediaType {
  if (!isOneOf(mediaTypeValues, value)) throw ApiError.of("not_found", `Unknown media type "${value}".`);
  return value;
}

export function parseArrProvider(value: string): ArrProvider {
  if (!isOneOf(arrProviderValues, value)) throw ApiError.of("not_found", `Unknown provider "${value}".`);
  return value;
}

export function parseIntegrationProvider(value: string): IntegrationProvider {
  if (!isOneOf(integrationProviderValues, value)) {
    throw ApiError.of("not_found", `Unknown integration "${value}".`);
  }
  return value;
}

export function parseFavoriteEntityType(value: string): FavoriteEntityType {
  if (!isOneOf(favoriteEntityTypeValues, value)) {
    throw ApiError.of("not_found", `Unknown favorite type "${value}".`);
  }
  return value;
}

/** TMDb/TVDB ids and Plex PIN ids are stored as Postgres `integer`. */
const MAX_INT_ID = 2_147_483_647;

/** A positive integer id from a path segment — anything else is a 404, the
 * same as the web page's notFound() for a non-numeric id. */
export function parseIdSegment(value: string, label = "id"): number {
  const id = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(id) || id <= 0 || id > MAX_INT_ID) {
    throw ApiError.of("not_found", `Invalid ${label} "${value}".`);
  }
  return id;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseUuidSegment(value: string, notFoundMessage: string): string {
  if (!UUID_PATTERN.test(value)) throw ApiError.of("not_found", notFoundMessage);
  return value;
}

export function queryInt(
  url: URL,
  key: string,
  { min, max }: { min?: number; max?: number } = {},
): number | undefined {
  const raw = url.searchParams.get(key);
  if (raw === null || raw === "") return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value)) throw invalid(`"${key}" must be an integer.`);
  if (min !== undefined && value < min) throw invalid(`"${key}" must be at least ${min}.`);
  if (max !== undefined && value > max) throw invalid(`"${key}" must be at most ${max}.`);
  return value;
}

/** `true`/`1` and `false`/`0`; anything else is a 400. */
export function queryBool(url: URL, key: string): boolean | undefined {
  const raw = url.searchParams.get(key);
  if (raw === null || raw === "") return undefined;
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;
  throw invalid(`"${key}" must be true or false.`);
}
