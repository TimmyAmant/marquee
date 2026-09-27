import { withApi } from "@/lib/api/handler";
import { requireApiAdmin } from "@/lib/api/auth";
import { ApiError, msg } from "@/lib/api/errors";
import { parseUuidSegment } from "@/lib/api/request";
import { SEERR_IMPORT_FORBIDDEN } from "@/lib/api/routes/seerr-import";
import { getSeerrImportJob } from "@/lib/import/seerr/import";
import type { SeerrImportJob } from "@/lib/api/types";

/** A running or finished import: its phase and progress, then its report. */
export const GET = withApi<{ id: string }>(async (request, params): Promise<SeerrImportJob> => {
  await requireApiAdmin(request, SEERR_IMPORT_FORBIDDEN);
  const id = parseUuidSegment(params.id, msg("server.seerrImportNotFound"));
  const job = getSeerrImportJob(id);
  if (!job) throw ApiError.of("not_found", msg("server.seerrImportNotFound"));
  return job;
});
