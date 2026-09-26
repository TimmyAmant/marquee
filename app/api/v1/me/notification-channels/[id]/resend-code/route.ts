import { withApi } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/api/auth";
import { unwrap } from "@/lib/api/guards";
import { personalChannelDto } from "@/lib/api/routes/notification-channels";
import { resendVerification } from "@/lib/notifications/personal";
import type { PersonalNotificationChannel } from "@/lib/api/types";

/** Emails a new confirmation code to an address not yet confirmed. */
export const POST = withApi<{ id: string }>(async (request, { id }): Promise<PersonalNotificationChannel> => {
  const ctx = await requireApiUser(request);
  const { channel } = unwrap(await resendVerification(ctx.user.id, id));
  return personalChannelDto(channel);
});
