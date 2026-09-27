import { withApi } from "@/lib/api/handler";
import { requireApiAdmin } from "@/lib/api/auth";
import { unwrap } from "@/lib/api/guards";
import { readJsonBody } from "@/lib/api/request";
import { DISCOVER_SETTINGS_FORBIDDEN } from "@/lib/api/routes/discover-settings";
import { getDiscoverLocaleSettings, saveDiscoverLocaleSettings, type DiscoverLocaleSettings } from "@/lib/discover/locale-settings";

/** Settings › Discover › Region & language (0.53+): the country
 * "Currently streaming on" is for, and the region / original language
 * TMDb's Popular and Upcoming rows are filtered to. */
export const GET = withApi(async (request): Promise<DiscoverLocaleSettings> => {
  await requireApiAdmin(request, DISCOVER_SETTINGS_FORBIDDEN);
  return getDiscoverLocaleSettings();
});

/** `{ "streamingRegion"?: "GB" | null, "discoverRegion"?: "GB" | null,
 * "discoverLanguage"?: "en" | "any" | null }` — only what's sent changes. */
export const PUT = withApi(async (request): Promise<DiscoverLocaleSettings> => {
  await requireApiAdmin(request, DISCOVER_SETTINGS_FORBIDDEN);
  const body = await readJsonBody(request);
  return unwrap(await saveDiscoverLocaleSettings(body)).settings;
});
