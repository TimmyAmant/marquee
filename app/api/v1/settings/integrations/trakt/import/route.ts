import { withApi } from "@/lib/api/handler";
import { requireApiAdmin } from "@/lib/api/auth";
import { unwrap } from "@/lib/api/guards";
import { readJsonBody } from "@/lib/api/request";
import { importTraktList } from "@/lib/integrations/trakt-import";
import type { TraktImportResult } from "@/lib/api/types";

/** Imports a public Trakt list or watchlist URL as pending requests from the
 * admin, skipping titles already owned/tracked or already requested. */
export const POST = withApi(async (request): Promise<TraktImportResult> => {
  const ctx = await requireApiAdmin(request, "Only the admin can import from Trakt.");
  const body = await readJsonBody(request);
  const { importedCount, skippedCount } = unwrap(
    await importTraktList(ctx.user.id, typeof body.url === "string" ? body.url : ""),
  );
  return { ok: true, importedCount, skippedCount };
});
