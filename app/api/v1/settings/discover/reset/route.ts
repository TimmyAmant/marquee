import { withApi } from "@/lib/api/handler";
import { requireApiAdmin } from "@/lib/api/auth";
import { DISCOVER_SETTINGS_FORBIDDEN, discoverSettingsDto } from "@/lib/api/routes/discover-settings";
import { resetDiscoverLayout } from "@/lib/discover/layout";
import type { DiscoverSettings } from "@/lib/api/types";

/** The built-in rows back in their usual order, all shown; the admin's own
 * rows stay, after them. */
export const POST = withApi(async (request): Promise<DiscoverSettings> => {
  await requireApiAdmin(request, DISCOVER_SETTINGS_FORBIDDEN);
  const { shelves } = await resetDiscoverLayout();
  return discoverSettingsDto(shelves);
});
