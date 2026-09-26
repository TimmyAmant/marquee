import { withApi } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/api/auth";
import { readJsonBody } from "@/lib/api/request";
import { unwrap } from "@/lib/api/guards";
import { personalChannelDto } from "@/lib/api/routes/notification-channels";
import { deleteChannel, updateChannel } from "@/lib/notifications/personal";
import type { PersonalNotificationChannel } from "@/lib/api/types";

/** `{ name?, enabled?, config? }` for one of your own channels. */
export const PATCH = withApi<{ id: string }>(async (request, { id }): Promise<PersonalNotificationChannel> => {
  const ctx = await requireApiUser(request);
  const body = await readJsonBody(request);
  const { channel } = unwrap(await updateChannel({ id: ctx.user.id, role: ctx.user.role }, id, body));
  return personalChannelDto(channel);
});

export const DELETE = withApi<{ id: string }>(async (request, { id }) => {
  const ctx = await requireApiUser(request);
  unwrap(await deleteChannel(ctx.user.id, id));
  return { ok: true };
});
