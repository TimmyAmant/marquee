import { settingDeleteHandler, settingPutHandler } from "@/lib/api/routes/integrations";
import { testAndSaveTmdbToken } from "@/lib/integrations/manage";
import { clearTmdbAccessToken } from "@/lib/integrations/app-settings";

/** Body: { accessToken } — a TMDb v4 read access token or v3 API key. */
export const PUT = settingPutHandler("accessToken", testAndSaveTmdbToken);
/** Removes the saved token (TMDB_ACCESS_TOKEN / TMDB_API_KEY env vars, if set, still apply). */
export const DELETE = settingDeleteHandler(clearTmdbAccessToken);
