import { settingDeleteHandler, settingPutHandler } from "@/lib/api/routes/integrations";
import { testAndSaveOmdbApiKey } from "@/lib/integrations/manage";
import { clearOmdbApiKey } from "@/lib/integrations/app-settings";

/** Body: { apiKey } — an OMDb API key (omdbapi.com), for IMDb / Rotten
 * Tomatoes / Metacritic ratings on title pages (0.53+). */
export const PUT = settingPutHandler("apiKey", testAndSaveOmdbApiKey);
export const DELETE = settingDeleteHandler(clearOmdbApiKey);
