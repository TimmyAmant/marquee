import { settingDeleteHandler, settingPutHandler } from "@/lib/api/routes/integrations";
import { testAndSaveDiscordWebhook } from "@/lib/integrations/manage";
import { clearDiscordWebhookUrl } from "@/lib/integrations/app-settings";

/** Body: { webhookUrl } — posts a test message before saving. */
export const PUT = settingPutHandler("webhookUrl", testAndSaveDiscordWebhook);
export const DELETE = settingDeleteHandler(clearDiscordWebhookUrl);
