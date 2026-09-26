import { withApi } from "@/lib/api/handler";
import { requireApiAdmin } from "@/lib/api/auth";
import { readJsonBody } from "@/lib/api/request";
import { unwrap } from "@/lib/api/guards";
import { householdEventsDto } from "@/lib/api/routes/notification-channels";
import { saveHouseholdEvents } from "@/lib/notifications/preferences";
import type { HouseholdNotificationEvents } from "@/lib/api/types";

const ADMIN_ONLY = "Only the admin can change the household channels.";

/** What the household channels (Discord, ntfy, Telegram, …) post. */
export const GET = withApi(async (request): Promise<HouseholdNotificationEvents> => {
  await requireApiAdmin(request, ADMIN_ONLY);
  return householdEventsDto();
});

/** `{ events: { <event>: bool } }`: only what's sent changes. */
export const PUT = withApi(async (request): Promise<HouseholdNotificationEvents> => {
  await requireApiAdmin(request, ADMIN_ONLY);
  unwrap(await saveHouseholdEvents(await readJsonBody(request)));
  return householdEventsDto();
});
