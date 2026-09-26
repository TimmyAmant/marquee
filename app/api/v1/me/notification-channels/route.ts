import { withApi } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/api/auth";
import { readJsonBody } from "@/lib/api/request";
import { unwrap } from "@/lib/api/guards";
import { apiJson } from "@/lib/api/errors";
import { personalChannelDto, personalChannelsDto } from "@/lib/api/routes/notification-channels";
import { createChannel } from "@/lib/notifications/personal";
import type { PersonalNotificationChannels } from "@/lib/api/types";

/** The signed-in account's own channels, and which kinds this server offers. */
export const GET = withApi(async (request): Promise<PersonalNotificationChannels> => {
  const ctx = await requireApiUser(request);
  return personalChannelsDto({ id: ctx.user.id, role: ctx.user.role });
});

/** `{ kind, name?, enabled?, config }`: tests, then adds one (201). */
export const POST = withApi(async (request) => {
  const ctx = await requireApiUser(request);
  const body = await readJsonBody(request);
  const { channel } = unwrap(await createChannel({ id: ctx.user.id, role: ctx.user.role }, body));
  return apiJson(personalChannelDto(channel), { status: 201 });
});
