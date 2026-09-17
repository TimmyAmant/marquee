import { withApi } from "@/lib/api/handler";
import { requireApiAdmin } from "@/lib/api/auth";
import { JOBS } from "@/lib/jobs/registry";
import type { Job, ListResponse } from "@/lib/api/types";

/** Settings → Jobs (admin): the scheduled maintenance jobs. */
export const GET = withApi(async (request): Promise<ListResponse<Job>> => {
  await requireApiAdmin(request, "Only the admin can run jobs.");
  return { results: JOBS.map((job) => ({ ...job })) };
});
