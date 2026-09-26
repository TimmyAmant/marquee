import { withApi } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/api/auth";
import { unwrap } from "@/lib/api/guards";
import { startTelegramLink } from "@/lib/notifications/personal";

/** "Connect Telegram": a one-time link that opens the household bot with
 * /start <code>. Then poll /telegram-link/poll with the code. */
export const POST = withApi(async (request) => {
  const ctx = await requireApiUser(request);
  const { code, url, expiresAt } = unwrap(await startTelegramLink(ctx.user.id));
  return { code, url, expiresAt: expiresAt.toISOString() };
});
