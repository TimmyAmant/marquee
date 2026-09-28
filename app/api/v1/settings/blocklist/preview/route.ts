import { withApi } from "@/lib/api/handler";
import { msg } from "@/lib/api/errors";
import { requireApiPermission } from "@/lib/api/auth";
import { unwrap } from "@/lib/api/guards";
import { readJsonBody } from "@/lib/api/request";
import { parseBlockRule, previewBlockRule, type BlockPreview } from "@/lib/requests/blocklist";

/** What a blocklist rule would block before it's added — the same body as
 * adding one (`kind` keyword, certification or adult). Only reads. */
export const POST = withApi(async (request): Promise<BlockPreview> => {
  await requireApiPermission(request, "manageBlocklist", msg("server.onlyAdminBlocklist"));
  const { rule } = unwrap(await parseBlockRule(await readJsonBody(request)));
  return previewBlockRule(rule);
});
