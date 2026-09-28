import { withApi } from "@/lib/api/handler";
import { msg } from "@/lib/api/errors";
import { requireApiAdmin } from "@/lib/api/auth";
import { jobDefinitions } from "@/lib/jobs/registry";
import { getStoredJobSchedules } from "@/lib/jobs/schedule-store";
import { getT } from "@/lib/i18n/server";
import type { Job, ListResponse } from "@/lib/api/types";

/** Settings → Jobs (admin): the scheduled maintenance jobs. */
export const GET = withApi(async (request): Promise<ListResponse<Job>> => {
  await requireApiAdmin(request, msg("server.onlyAdminJobs"));
  return { results: jobDefinitions(await getT(), await getStoredJobSchedules()) };
});
