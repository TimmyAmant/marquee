import { withApi } from "@/lib/api/handler";
import { requireApiAdmin } from "@/lib/api/auth";
import { unwrap } from "@/lib/api/guards";
import { removeBlocklistEntry } from "@/lib/requests/blocklist";
import type { Ok } from "@/lib/api/types";

/** Takes a title or keyword off the blocklist. */
export const DELETE = withApi<{ id: string }>(async (request, params): Promise<Ok> => {
  await requireApiAdmin(request, "Only the admin can manage the blocklist.");
  unwrap(await removeBlocklistEntry(params.id));
  return { ok: true };
});
