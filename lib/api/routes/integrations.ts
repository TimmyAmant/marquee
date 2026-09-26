import { withApi } from "@/lib/api/handler";
import { requireApiAdmin } from "@/lib/api/auth";
import { unwrap } from "@/lib/api/guards";
import { invalid, readJsonBody } from "@/lib/api/request";
import {
  clearIntegrationSetting,
  disconnectIntegration,
  getArrOptions,
  revalidateIntegrations,
  saveArrDefaultsFor,
  testAndSaveArrConnection,
} from "@/lib/integrations/manage";
import type { CoreResult } from "@/lib/core-result";
import type { ArrConnectionResult, ArrOptions, Ok } from "@/lib/api/types";
import type { ArrInstance, IntegrationProvider } from "@/lib/db/schema";

// Handler factories for /api/v1/settings/integrations/* — every one of them
// admin-only, exactly like Settings → Integrations and its server actions.

export const INTEGRATIONS_FORBIDDEN = "Only the admin can manage integrations.";

/** A body field the web form would read with `String(formData.get(key) || "")`. */
function formString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") throw invalid(`"${key}" must be a string.`);
  return value;
}

/** PUT: test a Sonarr/Radarr connection and save it (resets the add defaults
 * to the first root folder / quality profile, as the website does). */
export function arrPutHandler(provider: ArrInstance) {
  return withApi(async (request): Promise<ArrConnectionResult> => {
    const ctx = await requireApiAdmin(request, INTEGRATIONS_FORBIDDEN);
    const body = await readJsonBody(request);
    const result = unwrap(
      await testAndSaveArrConnection(ctx.user.id, provider, {
        baseUrl: formString(body, "baseUrl"),
        apiKey: formString(body, "apiKey"),
      }),
    );
    return {
      ok: true,
      baseUrl: result.baseUrl,
      rootFolders: result.rootFolders,
      qualityProfiles: result.qualityProfiles,
      selectedRootFolder: result.selectedRootFolder,
      selectedQualityProfileId: result.selectedQualityProfileId,
    };
  });
}

/** GET …/options: root folders and quality profiles of the saved connection. */
export function arrOptionsHandler(provider: ArrInstance) {
  return withApi(async (request): Promise<ArrOptions> => {
    const ctx = await requireApiAdmin(request, INTEGRATIONS_FORBIDDEN);
    const { rootFolders, qualityProfiles } = unwrap(await getArrOptions(ctx.user.id, provider));
    return { rootFolders, qualityProfiles };
  });
}

/** PUT …/defaults: { rootFolderPath, qualityProfileId } used when adding titles. */
export function arrDefaultsHandler(provider: ArrInstance) {
  return withApi(async (request): Promise<Ok> => {
    const ctx = await requireApiAdmin(request, INTEGRATIONS_FORBIDDEN);
    const body = await readJsonBody(request);
    const qualityProfileId = body.qualityProfileId;
    if (typeof qualityProfileId !== "number") throw invalid('"qualityProfileId" must be a number.');
    unwrap(
      await saveArrDefaultsFor(ctx.user.id, provider, {
        rootFolderPath: formString(body, "rootFolderPath"),
        qualityProfileId,
      }),
    );
    return { ok: true };
  });
}

/** DELETE for Sonarr/Radarr/Plex/Jellyfin: removes the connection and the
 * synced data it owns. */
export function disconnectHandler(provider: IntegrationProvider) {
  return withApi(async (request): Promise<Ok> => {
    const ctx = await requireApiAdmin(request, INTEGRATIONS_FORBIDDEN);
    await disconnectIntegration(ctx.user.id, provider);
    return { ok: true };
  });
}

/** PUT for an instance-wide setting that's verified before saving (TMDb,
 * Trakt, TVDB, Discord, ntfy, generic webhook): reads one body field. */
export function settingPutHandler(field: string, testAndSave: (value: string) => Promise<CoreResult>) {
  return withApi(async (request): Promise<Ok> => {
    await requireApiAdmin(request, INTEGRATIONS_FORBIDDEN);
    const body = await readJsonBody(request);
    unwrap(await testAndSave(formString(body, field)));
    return { ok: true };
  });
}

/** DELETE for one of those settings. */
export function settingDeleteHandler(clear: () => Promise<void>) {
  return withApi(async (request): Promise<Ok> => {
    await requireApiAdmin(request, INTEGRATIONS_FORBIDDEN);
    await clearIntegrationSetting(clear);
    return { ok: true };
  });
}

/** PUT for Telegram / Pushover / email: the whole JSON body goes to the
 * test-and-save, which reads the fields it needs. */
export function channelPutHandler(testAndSave: (body: Record<string, unknown>) => Promise<CoreResult>) {
  return withApi(async (request): Promise<Ok> => {
    await requireApiAdmin(request, INTEGRATIONS_FORBIDDEN);
    unwrap(await testAndSave(await readJsonBody(request)));
    revalidateIntegrations();
    return { ok: true };
  });
}
