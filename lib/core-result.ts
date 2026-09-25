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
  | "setup_complete"
  | "rate_limited"
  | "upstream"
  | "internal";

export type CoreFailure = { ok: false; error: string; code: CoreErrorCode };

export type CoreResult<T extends object = object> = ({ ok: true } & T) | CoreFailure;

export function fail(code: CoreErrorCode, error: string): CoreFailure {
  return { ok: false, error, code };
}
