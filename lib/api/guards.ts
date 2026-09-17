import { ApiError } from "@/lib/api/errors";
import { isTmdbConfigured, TmdbNotConfiguredError } from "@/lib/tmdb/client";
import type { CoreResult } from "@/lib/core-result";

/** The website renders TMDb-backed pages as empty shelves when TMDb isn't
 * configured (every call fails soft). The API instead reports it up front as
 * `502 upstream`, so a native client can explain why rather than show a
 * blank screen. */
export async function requireTmdbConfigured(): Promise<void> {
  if (!(await isTmdbConfigured())) throw new TmdbNotConfiguredError();
}

/** Unwraps a shared-core result, throwing its failure as the matching API error. */
export function unwrap<T extends object>(result: CoreResult<T>): Extract<CoreResult<T>, { ok: true }> {
  if (!result.ok) throw ApiError.fromFailure(result);
  return result as Extract<CoreResult<T>, { ok: true }>;
}
