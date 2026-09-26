import { withApi } from "@/lib/api/handler";
import { requireApiAdmin } from "@/lib/api/auth";
import { unwrap } from "@/lib/api/guards";
import { ApiError, msg } from "@/lib/api/errors";
import { isJobId, runJob } from "@/lib/jobs/registry";
import type { Ok } from "@/lib/api/types";

/** "Run now" (admin). Waits for the job to finish — syncs can take a while
 * on a large library, so use a generous client timeout. */
export const POST = withApi<{ id: string }>(async (request, params): Promise<Ok> => {
  await requireApiAdmin(request, msg("server.onlyAdminJobs"));
  if (!isJobId(params.id)) throw ApiError.of("not_found", msg("server.unknownJob"));
  unwrap(await runJob(params.id));
  return { ok: true };
});
