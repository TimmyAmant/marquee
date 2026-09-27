import { withApi } from "@/lib/api/handler";
import { requireApiAdmin } from "@/lib/api/auth";
import { unwrap } from "@/lib/api/guards";
import { readJsonBody } from "@/lib/api/request";
import { SEERR_IMPORT_FORBIDDEN } from "@/lib/api/routes/seerr-import";
import { previewSeerrImport } from "@/lib/import/seerr/import";
import type { SeerrImportPreview } from "@/lib/api/types";

/** What importing from this Seerr would do — accounts matched and new,
 * requests, problem reports and blocklist entries to bring over. Reads
 * everything from Seerr, changes nothing. */
export const POST = withApi(async (request): Promise<SeerrImportPreview> => {
  const ctx = await requireApiAdmin(request, SEERR_IMPORT_FORBIDDEN);
  const body = await readJsonBody(request);
  const { preview } = unwrap(await previewSeerrImport(ctx.user.id, { url: body.url, apiKey: body.apiKey }));
  return preview;
});
