import { channelPutHandler, settingDeleteHandler } from "@/lib/api/routes/integrations";
import { clearChannel, testAndSaveSlack } from "@/lib/notifications/channels";

/** Sends a test message before saving (see docs/api-v1.md for the body). */
export const PUT = channelPutHandler(testAndSaveSlack);
export const DELETE = settingDeleteHandler(() => clearChannel("slack"));
