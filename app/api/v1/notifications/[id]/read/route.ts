import { withApi } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { parseUuidSegment } from "@/lib/api/request";
import { markNotificationRead } from "@/lib/notifications/query";
import type { Ok } from "@/lib/api/types";

/** Marks one of the caller's notifications read (the website does this when
 * a notification is clicked). 404 for someone else's notification. */
export const POST = withApi<{ id: string }>(async (request, params): Promise<Ok> => {
  const ctx = await requireApiUser(request);
  const id = parseUuidSegment(params.id, "Notification not found.");
  if (!(await markNotificationRead(ctx.user.id, id))) {
    throw ApiError.of("not_found", "Notification not found.");
  }
  return { ok: true };
});
