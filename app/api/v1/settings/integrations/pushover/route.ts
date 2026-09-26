import { channelPutHandler, settingDeleteHandler } from "@/lib/api/routes/integrations";
import { clearChannel, testAndSavePushover } from "@/lib/notifications/channels";

/** Sends a test message before saving (see docs/api-v1.md for the body). */
export const PUT = channelPutHandler(testAndSavePushover);
export const DELETE = settingDeleteHandler(() => clearChannel("pushover"));
