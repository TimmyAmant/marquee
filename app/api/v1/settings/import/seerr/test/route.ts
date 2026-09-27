import { withApi } from "@/lib/api/handler";
import { requireApiAdmin } from "@/lib/api/auth";
import { unwrap } from "@/lib/api/guards";
import { readJsonBody } from "@/lib/api/request";
import { SEERR_IMPORT_FORBIDDEN } from "@/lib/api/routes/seerr-import";
import { testSeerrConnection } from "@/lib/import/seerr/import";
import type { SeerrTestResult } from "@/lib/api/types";

/** Checks a Seerr address and admin API key: `{ "url": "http://…:5055",
 * "apiKey": "…" }`. Nothing is stored. */
export const POST = withApi(async (request): Promise<SeerrTestResult> => {
  await requireApiAdmin(request, SEERR_IMPORT_FORBIDDEN);
  const body = await readJsonBody(request);
  const { server } = unwrap(await testSeerrConnection({ url: body.url, apiKey: body.apiKey }));
  return { ok: true, server };
});
