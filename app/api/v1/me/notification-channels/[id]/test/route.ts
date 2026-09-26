import { withApi } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/api/auth";
import { unwrap } from "@/lib/api/guards";
import { personalChannelDto } from "@/lib/api/routes/notification-channels";
import { testChannel } from "@/lib/notifications/personal";
import type { PersonalNotificationChannel } from "@/lib/api/types";

/** "Send a test" through one of your own channels. */
export const POST = withApi<{ id: string }>(async (request, { id }): Promise<PersonalNotificationChannel> => {
  const ctx = await requireApiUser(request);
  const { channel } = unwrap(await testChannel({ id: ctx.user.id, role: ctx.user.role }, id));
  return personalChannelDto(channel);
});
