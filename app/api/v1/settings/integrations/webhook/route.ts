import { settingDeleteHandler, settingPutHandler } from "@/lib/api/routes/integrations";
import { testAndSaveGenericWebhookUrl } from "@/lib/integrations/manage";
import { clearGenericWebhookUrl } from "@/lib/integrations/app-settings";

/** Generic outgoing webhook. Body: { webhookUrl } — posts a test request before saving. */
export const PUT = settingPutHandler("webhookUrl", testAndSaveGenericWebhookUrl);
export const DELETE = settingDeleteHandler(clearGenericWebhookUrl);
