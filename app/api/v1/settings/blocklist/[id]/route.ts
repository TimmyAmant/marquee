import { withApi } from "@/lib/api/handler";
import { msg } from "@/lib/api/errors";
import { requireApiPermission } from "@/lib/api/auth";
import { unwrap } from "@/lib/api/guards";
import { removeBlocklistEntry } from "@/lib/requests/blocklist";
import type { Ok } from "@/lib/api/types";

/** Takes a title or keyword off the blocklist. */
export const DELETE = withApi<{ id: string }>(async (request, params): Promise<Ok> => {
  await requireApiPermission(request, "manageBlocklist", msg("server.onlyAdminBlocklist"));
  unwrap(await removeBlocklistEntry(params.id));
  return { ok: true };
});
