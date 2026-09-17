import { settingDeleteHandler, settingPutHandler } from "@/lib/api/routes/integrations";
import { testAndSaveTvdbApiKey } from "@/lib/integrations/manage";
import { clearTvdbApiKey } from "@/lib/integrations/app-settings";

/** Body: { apiKey } — a TheTVDB v4 API key. */
export const PUT = settingPutHandler("apiKey", testAndSaveTvdbApiKey);
export const DELETE = settingDeleteHandler(clearTvdbApiKey);
