import { withApi } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/api/auth";
import { readJsonBody } from "@/lib/api/request";
import { unwrap } from "@/lib/api/guards";
import { apiJson } from "@/lib/api/errors";
import { personalChannelDto } from "@/lib/api/routes/notification-channels";
import { pollTelegramLink } from "@/lib/notifications/personal";

/** `{ code, name? }`: 202 `{ status: "pending" }` until the bot has seen
 * /start <code>, then 201 with the new channel. */
export const POST = withApi(async (request) => {
  const ctx = await requireApiUser(request);
  const body = await readJsonBody(request);
  const result = unwrap(await pollTelegramLink({ id: ctx.user.id, role: ctx.user.role }, body.code, body.name));
  if (result.status === "pending") return apiJson({ status: "pending" }, { status: 202 });
  return apiJson(personalChannelDto(result.channel), { status: 201 });
});
