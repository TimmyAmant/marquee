import { withApi } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/api/auth";
import { CHANGELOG } from "@/lib/changelog";
import type { ChangelogEntry, ListResponse } from "@/lib/api/types";

/** The Releases page, newest first. */
export const GET = withApi(async (request): Promise<ListResponse<ChangelogEntry>> => {
  await requireApiUser(request);
  return { results: CHANGELOG.map((entry) => ({ version: entry.version, date: entry.date, changes: entry.changes })) };
});
