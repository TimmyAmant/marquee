/**
 * Shared result shape for business logic that both a server action (web) and
 * an /api/v1 route handler (native clients) call. The server action only
 * surfaces `error` to the form; the route handler maps `code` onto an HTTP
 * status (see lib/api/errors.ts). Keeping the code next to the message at the
 * point the failure is decided means the API never has to guess a status by
 * pattern-matching message text.
 */
export type CoreErrorCode =
  | "invalid"
  | "unauthorized"
  | "invalid_credentials"
  | "forbidden"
  | "not_found"
  | "conflict"
  /** A one-time code or link that's used up or past its time. */
  | "expired"
  | "setup_complete"
  | "rate_limited"
  | "upstream"
  | "internal";

/** `apiReason`: a finer, stable code for the few failures a client acts on
 * (see ErrorReason) — the message itself is in the reader's language, so
 * it's never something to match on. */
export type CoreFailure = { ok: false; error: string; code: CoreErrorCode; apiReason?: ErrorReason };

/** The failures an app does something specific for, whatever language the
 * message is in: offer "add it manually in Sonarr", or explain that TMDb
 * needs setting up. Sent as `reason` on the API's error body (0.50+). */
export type ErrorReason = "sonarr_unresolved" | "tmdb_not_configured";

export type CoreResult<T extends object = object> = ({ ok: true } & T) | CoreFailure;

export function fail(code: CoreErrorCode, error: string, reason?: ErrorReason): CoreFailure {
  return reason ? { ok: false, error, code, apiReason: reason } : { ok: false, error, code };
}
