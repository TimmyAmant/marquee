import { withApi } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/api/auth";
import { readJsonBody } from "@/lib/api/request";
import { unwrap } from "@/lib/api/guards";
import { personalChannelDto } from "@/lib/api/routes/notification-channels";
import { verifyChannel } from "@/lib/notifications/personal";
import type { PersonalNotificationChannel } from "@/lib/api/types";

/** `{ code }`: the 6 digits emailed to a new address. */
export const POST = withApi<{ id: string }>(async (request, { id }): Promise<PersonalNotificationChannel> => {
  const ctx = await requireApiUser(request);
  const body = await readJsonBody(request);
  const { channel } = unwrap(await verifyChannel(ctx.user.id, id, body.code));
  return personalChannelDto(channel);
});
