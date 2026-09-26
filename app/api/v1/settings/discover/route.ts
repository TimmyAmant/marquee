import { withApi } from "@/lib/api/handler";
import { requireApiAdmin } from "@/lib/api/auth";
import { unwrap } from "@/lib/api/guards";
import { readJsonBody } from "@/lib/api/request";
import { DISCOVER_SETTINGS_FORBIDDEN, discoverSettingsDto } from "@/lib/api/routes/discover-settings";
import { saveDiscoverLayout } from "@/lib/discover/layout";
import type { DiscoverSettings } from "@/lib/api/types";

/** Every Discover row in the admin's order, hidden ones included. */
export const GET = withApi(async (request): Promise<DiscoverSettings> => {
  await requireApiAdmin(request, DISCOVER_SETTINGS_FORBIDDEN);
  return discoverSettingsDto();
});

/** A new order and which rows show: `{ "shelves": [{ "id": "trending",
 * "hidden": false }, …] }`. */
export const PUT = withApi(async (request): Promise<DiscoverSettings> => {
  await requireApiAdmin(request, DISCOVER_SETTINGS_FORBIDDEN);
  const body = await readJsonBody(request);
  const { shelves } = unwrap(await saveDiscoverLayout(body.shelves));
  return discoverSettingsDto(shelves);
});
