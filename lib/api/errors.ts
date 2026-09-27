// Response helpers and error mapping for /api/v1. Dependency-free apart from
// the TMDb error classes (themselves dependency-free), so the mapping from
// thrown errors to contract codes is unit testable.
import type { CoreErrorCode, CoreFailure, ErrorReason } from "@/lib/core-result";
import { TmdbError, TmdbNotConfiguredError } from "@/lib/tmdb/errors";
import { englishT } from "@/lib/i18n/catalog";
import type { MessageKey, MessageValues, Translator } from "@/lib/i18n/translator";

export const API_VERSION_HEADER = "X-Marquee-API";
export const API_VERSION = 1;

// "expired": a Plex sign-in handle that's used, unknown or past its 10
// minutes (POST /auth/plex/poll) — start again.
export type ApiErrorCode = CoreErrorCode | "expired";

const DEFAULT_STATUS: Record<ApiErrorCode, number> = {
  invalid: 400,
  unauthorized: 401,
  invalid_credentials: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  expired: 410,
  setup_complete: 409,
  rate_limited: 429,
  internal: 500,
  upstream: 502,
};

export function statusForCode(code: ApiErrorCode): number {
  return DEFAULT_STATUS[code];
}

/** A message still to be translated: `withApi` writes it in the language
 * of whoever the request is for (lib/i18n) when it answers. */
export type LocalizedMessage = { key: MessageKey; values?: MessageValues };

/** An error's message: either already written for the reader (a shared
 * core's failure, translated where it was decided) or a key to translate. */
export type ApiMessage = string | LocalizedMessage;

/** `msg("server.requestNotFound")`: a message for an ApiError, translated
 * when the response is written — so sync helpers need no `t`. */
export function msg(key: MessageKey, values?: MessageValues): LocalizedMessage {
  return values ? { key, values } : { key };
}

/** Throw from anywhere inside a v1 handler to short-circuit with a contract
 * error response — `withApi` turns it into JSON. `message` is English (logs,
 * tests); `messageIn(t)` is what the reader gets. */
export class ApiError extends Error {
  readonly localized: LocalizedMessage | null;

  constructor(
    public status: number,
    public code: ApiErrorCode,
    message: ApiMessage,
    /** Sent as `reason` beside `code` (0.50+): see ErrorReason. */
    public reason?: ErrorReason,
  ) {
    super(typeof message === "string" ? message : englishT()(message.key, message.values));
    this.name = "ApiError";
    this.localized = typeof message === "string" ? null : message;
  }

  static of(code: ApiErrorCode, message: ApiMessage, reason?: ErrorReason): ApiError {
    return new ApiError(statusForCode(code), code, message, reason);
  }

  /** The message in `t`'s language. */
  messageIn(t: Translator): string {
    return this.localized ? t(this.localized.key, this.localized.values) : this.message;
  }

  static fromFailure(failure: CoreFailure): ApiError {
    return ApiError.of(failure.code, failure.error, failure.apiReason);
  }
}

function withVersionHeader(init?: ResponseInit): Headers {
  const headers = new Headers(init?.headers);
  headers.set(API_VERSION_HEADER, String(API_VERSION));
  headers.set("Cache-Control", "no-store");
  return headers;
}

export function apiJson(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, { ...init, headers: withVersionHeader(init) });
}

export function jsonError(status: number, code: ApiErrorCode, message: string, reason?: ErrorReason): Response {
  return apiJson(reason ? { error: message, code, reason } : { error: message, code }, { status });
}

export const TMDB_NOT_CONFIGURED_API_MESSAGE = msg("server.tmdbNotConfigured");

/** Maps anything thrown out of a handler onto a contract error. Unknown
 * errors become a generic 500 so internals (SQL, stack traces, upstream
 * URLs) never leak to the client — the caller logs the original. */
export function errorToApiError(err: unknown): { error: ApiError; unexpected: boolean } {
  if (err instanceof ApiError) return { error: err, unexpected: false };
  if (err instanceof TmdbNotConfiguredError) {
    return { error: ApiError.of("upstream", TMDB_NOT_CONFIGURED_API_MESSAGE, "tmdb_not_configured"), unexpected: false };
  }
  if (err instanceof TmdbError) {
    if (err.status === 404) {
      return { error: ApiError.of("not_found", msg("server.tmdbNoRecord")), unexpected: false };
    }
    return {
      error: ApiError.of("upstream", msg("server.tmdbRequestFailed", { status: String(err.status) })),
      unexpected: false,
    };
  }
  // Every outbound client (TMDb, Sonarr, Radarr, Plex, Jellyfin, Trakt…) uses
  // AbortSignal.timeout + fetch, so these two shapes mean "a connected service
  // didn't answer" rather than a bug in Marquee. Which service isn't knowable
  // here; routes that know wrap their own calls with a specific message.
  if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
    return { error: ApiError.of("upstream", msg("server.serviceTimedOut")), unexpected: true };
  }
  if (err instanceof TypeError && err.message === "fetch failed") {
    return { error: ApiError.of("upstream", msg("server.serviceUnreachable")), unexpected: true };
  }
  return { error: ApiError.of("internal", msg("server.internalError")), unexpected: true };
}
