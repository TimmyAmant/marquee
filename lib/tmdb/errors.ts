// Kept dependency-free (no "server-only", no settings lookup) so error
// handling that needs to recognize these — e.g. lib/api/errors.ts — can be
// unit tested without pulling in the TMDb client itself.

export class TmdbError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "TmdbError";
  }
}

export const TMDB_NOT_CONFIGURED_MESSAGE =
  "Set a TMDb access token in Settings, or TMDB_ACCESS_TOKEN/TMDB_API_KEY in the environment";

/** Thrown when no TMDb credential exists at all (nothing saved in Settings and
 * nothing in the environment) — distinct from TmdbError, which means TMDb
 * itself was reached and answered with an error. */
export class TmdbNotConfiguredError extends Error {
  constructor() {
    super(TMDB_NOT_CONFIGURED_MESSAGE);
    this.name = "TmdbNotConfiguredError";
  }
}
