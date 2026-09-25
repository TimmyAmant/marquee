// Response helpers and error mapping for /api/v1. Dependency-free apart from
// the TMDb error classes (themselves dependency-free), so the mapping from
// thrown errors to contract codes is unit testable.
import type { CoreErrorCode, CoreFailure } from "@/lib/core-result";
import { TmdbError, TmdbNotConfiguredError } from "@/lib/tmdb/errors";

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

/** Throw from anywhere inside a v1 handler to short-circuit with a contract
 * error response — `withApi` turns it into JSON. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: ApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }

  static of(code: ApiErrorCode, message: string): ApiError {
    return new ApiError(statusForCode(code), code, message);
  }

  static fromFailure(failure: CoreFailure): ApiError {
    return ApiError.of(failure.code, failure.error);
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

export function jsonError(status: number, code: ApiErrorCode, message: string): Response {
  return apiJson({ error: message, code }, { status });
}

export const TMDB_NOT_CONFIGURED_API_MESSAGE =
  "TMDb isn't configured on this server. An admin needs to add a TMDb access token in Settings → Integrations.";

/** Maps anything thrown out of a handler onto a contract error. Unknown
 * errors become a generic 500 so internals (SQL, stack traces, upstream
 * URLs) never leak to the client — the caller logs the original. */
export function errorToApiError(err: unknown): { error: ApiError; unexpected: boolean } {
  if (err instanceof ApiError) return { error: err, unexpected: false };
  if (err instanceof TmdbNotConfiguredError) {
    return { error: ApiError.of("upstream", TMDB_NOT_CONFIGURED_API_MESSAGE), unexpected: false };
  }
  if (err instanceof TmdbError) {
    if (err.status === 404) {
      return { error: ApiError.of("not_found", "TMDb has no record with that id."), unexpected: false };
    }
    return {
      error: ApiError.of("upstream", `TMDb request failed (HTTP ${err.status}).`),
      unexpected: false,
    };
  }
  // Every outbound client (TMDb, Sonarr, Radarr, Plex, Jellyfin, Trakt…) uses
  // AbortSignal.timeout + fetch, so these two shapes mean "a connected service
  // didn't answer" rather than a bug in Marquee. Which service isn't knowable
  // here; routes that know wrap their own calls with a specific message.
  if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
    return { error: ApiError.of("upstream", "A connected service timed out."), unexpected: true };
  }
  if (err instanceof TypeError && err.message === "fetch failed") {
    return { error: ApiError.of("upstream", "Couldn't reach a connected service."), unexpected: true };
  }
  return { error: ApiError.of("internal", "Something went wrong on the server."), unexpected: true };
}
