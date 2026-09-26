import { withApi } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/api/auth";
import { readJsonBody } from "@/lib/api/request";
import { unwrap } from "@/lib/api/guards";
import { preferencesDto } from "@/lib/api/routes/notification-channels";
import { savePreferences } from "@/lib/notifications/preferences";
import type { NotificationPreferences } from "@/lib/api/types";

/** Which events reach the bell, device push, and each of your channels. */
export const GET = withApi(async (request): Promise<NotificationPreferences> => {
  const ctx = await requireApiUser(request);
  return preferencesDto({ id: ctx.user.id, role: ctx.user.role });
});

/** `{ events: [{ event, inApp?, push?, channels?: { <id>: bool } }] }`:
 * only what's sent changes. Answers the whole matrix. */
export const PUT = withApi(async (request): Promise<NotificationPreferences> => {
  const ctx = await requireApiUser(request);
  const body = await readJsonBody(request);
  unwrap(await savePreferences(ctx.user.id, ctx.user.role, body));
  return preferencesDto({ id: ctx.user.id, role: ctx.user.role });
});
