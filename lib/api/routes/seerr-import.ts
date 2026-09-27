import { msg } from "@/lib/api/errors";

/** /api/v1/settings/import/seerr/*: the admin's alone, like every other
 * integration — and never reachable with an API key (lib/api/key-policy.ts),
 * since a Seerr admin key goes through it. */
export const SEERR_IMPORT_FORBIDDEN = msg("server.onlyAdminSeerrImport");
