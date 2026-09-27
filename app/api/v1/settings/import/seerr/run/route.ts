import { withApi } from "@/lib/api/handler";
import { requireApiAdmin } from "@/lib/api/auth";
import { unwrap } from "@/lib/api/guards";
import { readJsonBody } from "@/lib/api/request";
import { apiJson } from "@/lib/api/errors";
import { SEERR_IMPORT_FORBIDDEN } from "@/lib/api/routes/seerr-import";
import { parseSeerrImportChoices, startSeerrImport } from "@/lib/import/seerr/import";

/** Starts the import in the background (one at a time) and answers 202
 * with the job to poll at GET …/jobs/{id}. Body: the address and key plus
 * what to import — `users`, `updateExistingUsers`, `requests`, `issues`,
 * `blocklist` (each true unless sent false; `updateExistingUsers` false). */
export const POST = withApi(async (request) => {
  const ctx = await requireApiAdmin(request, SEERR_IMPORT_FORBIDDEN);
  const body = await readJsonBody(request);
  const { job } = unwrap(await startSeerrImport(ctx.user.id, { url: body.url, apiKey: body.apiKey }, parseSeerrImportChoices(body)));
  return apiJson(job, { status: 202 });
});
