import { withApi } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/api/auth";
import { unwrap } from "@/lib/api/guards";
import { parseUuidSegment } from "@/lib/api/request";
import { getRequestEditOptions } from "@/lib/requests/edit-options";
import type { RequestEditOptions } from "@/lib/api/types";

/** What "Edit" on a pending request can offer: the show's seasons for the
 * picker, and whether 4K is an option. Your own request, or (reviewers) any. */
export const GET = withApi<{ id: string }>(async (request, params): Promise<RequestEditOptions> => {
  const ctx = await requireApiUser(request);
  const id = parseUuidSegment(params.id, "Request not found.");
  return unwrap(await getRequestEditOptions({ userId: ctx.user.id, role: ctx.user.role }, id)).options;
});
