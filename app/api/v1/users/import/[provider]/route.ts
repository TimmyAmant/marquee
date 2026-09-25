import { withApi } from "@/lib/api/handler";
import { requireApiAdmin } from "@/lib/api/auth";
import { unwrap } from "@/lib/api/guards";
import { householdMember } from "@/lib/api/mappers";
import { readJsonBody } from "@/lib/api/request";
import { parseMediaProvider, readImportIds } from "@/lib/api/routes/media-auth";
import { importMediaUsers, listImportCandidates } from "@/lib/auth/media-signin";
import { getHouseholdMember } from "@/lib/users/household";
import type { HouseholdMember, ImportCandidate, ImportResult, ListResponse } from "@/lib/api/types";

const FORBIDDEN = "Only the admin can add household members.";

/** "Import from Plex / Jellyfin" (admin): the people on the admin's Plex
 * (friends and Home users with access to the admin's server) or Jellyfin
 * server, each marked `alreadyMember` when an account is linked to them. */
export const GET = withApi<{ provider: string }>(
  async (request, params): Promise<ListResponse<ImportCandidate>> => {
    await requireApiAdmin(request, FORBIDDEN);
    const provider = parseMediaProvider(params.provider);
    const { results } = unwrap(await listImportCandidates(provider));
    return { results };
  },
);

/** Creates linked member accounts (no password; they sign in with Plex /
 * Jellyfin) for `{ ids: [...] }` from the listing. Ids not on the server
 * any more, or already members, count as `skipped`. */
export const POST = withApi<{ provider: string }>(async (request, params): Promise<ImportResult> => {
  const ctx = await requireApiAdmin(request, FORBIDDEN);
  const provider = parseMediaProvider(params.provider);
  const ids = readImportIds(await readJsonBody(request));

  const { createdIds, skipped } = unwrap(await importMediaUsers(provider, ids));

  const created: HouseholdMember[] = [];
  for (const id of createdIds) {
    const row = await getHouseholdMember(id);
    if (row) created.push(householdMember(row, ctx.user.id));
  }
  return { created, skipped };
});
