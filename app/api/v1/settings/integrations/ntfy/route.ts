import { settingDeleteHandler, settingPutHandler } from "@/lib/api/routes/integrations";
import { testAndSaveNtfyTopic } from "@/lib/integrations/manage";
import { clearNtfyUrl } from "@/lib/integrations/app-settings";

/** Body: { topicUrl } — posts a test message before saving. */
export const PUT = settingPutHandler("topicUrl", testAndSaveNtfyTopic);
export const DELETE = settingDeleteHandler(clearNtfyUrl);
