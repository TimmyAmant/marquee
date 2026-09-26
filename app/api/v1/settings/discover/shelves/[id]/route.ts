import { withApi } from "@/lib/api/handler";
import { requireApiAdmin } from "@/lib/api/auth";
import { unwrap } from "@/lib/api/guards";
import { readJsonBody } from "@/lib/api/request";
import { DISCOVER_SETTINGS_FORBIDDEN, discoverShelfSettingDto } from "@/lib/api/routes/discover-settings";
import { deleteShelf, updateShelf } from "@/lib/discover/layout";
import type { DiscoverShelfSetting, Ok } from "@/lib/api/types";

/** Shows or hides any row; renames a custom row or changes what it shows:
 * `{ hidden?, title?, mediaType?, tmdbId?, name?, url? }`. */
export const PATCH = withApi<{ id: string }>(async (request, params): Promise<DiscoverShelfSetting> => {
  await requireApiAdmin(request, DISCOVER_SETTINGS_FORBIDDEN);
  const body = await readJsonBody(request);
  const { shelf } = unwrap(await updateShelf(params.id, body));
  return discoverShelfSettingDto(shelf);
});

/** Removes one of the admin's own rows (a built-in row can only be hidden). */
export const DELETE = withApi<{ id: string }>(async (request, params): Promise<Ok> => {
  await requireApiAdmin(request, DISCOVER_SETTINGS_FORBIDDEN);
  unwrap(await deleteShelf(params.id));
  return { ok: true };
});
