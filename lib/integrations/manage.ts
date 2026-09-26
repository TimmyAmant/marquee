import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { integrationCredentials, plexServers, jellyfinServers, arrStatusCache } from "@/lib/db/schema";
import type { ArrInstance, IntegrationProvider } from "@/lib/db/schema";
import { arrInstanceLabel, arrKindOf } from "@/lib/arr/fourk";
import {
  getArrCredential,
  getOrCreatePlexClientId,
  getPlexCredential,
  getJellyfinCredential,
  updateArrDefaults,
  upsertArrCredential,
  upsertJellyfinCredential,
  upsertPlexCredential,
} from "@/lib/integrations/credentials";
import {
  setTmdbAccessToken,
  setTraktClientId,
  setTvdbApiKey,
  setDiscordWebhookUrl,
  setGenericWebhookUrl,
  setNtfyUrl,
} from "@/lib/integrations/app-settings";
import * as sonarr from "@/lib/sonarr/client";
import * as radarr from "@/lib/radarr/client";
import * as jellyfin from "@/lib/jellyfin/client";
import * as plex from "@/lib/plex/client";
import { syncPlexLibrary, getPlexSummary, resyncPlexLibraryFromScratch, waitForPlexSync } from "@/lib/plex/sync";
import { syncJellyfinLibrary, waitForJellyfinSync } from "@/lib/jellyfin/sync";
import { syncArrLibrary, waitForArrSync } from "@/lib/arr/sync";
import { verifyTmdbAccessToken } from "@/lib/tmdb/client";
import { verifyTraktClientId } from "@/lib/trakt/client";
import { verifyTvdbApiKey } from "@/lib/tvdb/client";
import { verifyDiscordWebhook } from "@/lib/discord/client";
import { verifyNtfyUrl } from "@/lib/ntfy/client";
import { verifyWebhookUrl } from "@/lib/webhook/client";
import { fail, type CoreResult } from "@/lib/core-result";

// Settings → Integrations operations shared by the web's server actions
// (app/settings/integrations/*-actions.ts) and /api/v1/settings/integrations/*.
// Every function here assumes the caller already verified the actor is the
// admin (except syncNowForUser, which only ever touches the caller's own
// integrations) and does its own input validation with the web's messages.

export function revalidateIntegrations() {
  revalidatePath("/settings/integrations");
}

function arrClientFor(instance: ArrInstance) {
  return arrKindOf(instance) === "sonarr" ? sonarr : radarr;
}

export function normalizeServerUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

export type ArrOptions = {
  rootFolders: { id: number; path: string }[];
  qualityProfiles: { id: number; name: string }[];
};

export type ArrConnectionResult = ArrOptions & {
  baseUrl: string;
  selectedRootFolder: string | null;
  selectedQualityProfileId: number | null;
};

export async function testAndSaveArrConnection(
  adminUserId: string,
  provider: ArrInstance,
  input: { baseUrl: string; apiKey: string },
): Promise<CoreResult<ArrConnectionResult>> {
  const baseUrl = normalizeServerUrl(input.baseUrl);
  const apiKey = input.apiKey.trim();
  if (!baseUrl || !apiKey) {
    return fail("invalid", "URL and API key are required.");
  }

  const client = arrClientFor(provider);

  try {
    await client.testConnection({ baseUrl, apiKey });
  } catch {
    return fail("upstream", "Couldn't connect. Check the URL and API key and try again.");
  }

  const [rootFolders, qualityProfiles] = await Promise.all([
    client.getRootFolders({ baseUrl, apiKey }),
    client.getQualityProfiles({ baseUrl, apiKey }),
  ]);

  const selectedRootFolder = rootFolders[0]?.path ?? null;
  const selectedQualityProfileId = qualityProfiles[0]?.id ?? null;

  await upsertArrCredential(adminUserId, provider, {
    baseUrl,
    apiKey,
    qualityProfileId: selectedQualityProfileId,
    rootFolderPath: selectedRootFolder,
  });

  revalidateIntegrations();

  return {
    ok: true,
    baseUrl,
    rootFolders,
    qualityProfiles,
    selectedRootFolder,
    selectedQualityProfileId,
  };
}

/** Root folders + quality profiles from an already-saved Sonarr/Radarr
 * connection — what the "defaults" pickers are populated with. */
export async function getArrOptions(adminUserId: string, provider: ArrInstance): Promise<CoreResult<ArrOptions>> {
  const credential = await getArrCredential(adminUserId, provider);
  const label = arrInstanceLabel(provider);
  if (!credential) return fail("conflict", `Connect ${label} in Settings first.`);

  const client = arrClientFor(provider);
  const config = { baseUrl: credential.baseUrl, apiKey: credential.apiKey };
  try {
    const [rootFolders, qualityProfiles] = await Promise.all([
      client.getRootFolders(config),
      client.getQualityProfiles(config),
    ]);
    return { ok: true, rootFolders, qualityProfiles };
  } catch {
    return fail("upstream", `Couldn't reach ${label}. Check its connection in Settings.`);
  }
}

export async function saveArrDefaultsFor(
  adminUserId: string,
  provider: ArrInstance,
  input: { rootFolderPath: string; qualityProfileId: number },
): Promise<CoreResult> {
  if (!input.rootFolderPath || !Number.isFinite(input.qualityProfileId)) {
    return fail("invalid", "Pick a root folder and a quality profile.");
  }

  await updateArrDefaults(adminUserId, provider, {
    rootFolderPath: input.rootFolderPath,
    qualityProfileId: input.qualityProfileId,
  });
  revalidateIntegrations();
  return { ok: true };
}

/** Removes a saved integration entirely — the credential row, plus whatever
 * synced data that provider owns, so a disconnected integration doesn't
 * leave stale "owned"/"tracked" statuses lingering around afterward. */
export async function disconnectIntegration(adminUserId: string, provider: IntegrationProvider): Promise<void> {
  await db
    .delete(integrationCredentials)
    .where(and(eq(integrationCredentials.userId, adminUserId), eq(integrationCredentials.provider, provider)));

  // A sync already running would keep writing rows after the deletes below
  // and bring the library back. With the credential gone it stops at its
  // next still-connected check, so wait for that before clearing its data —
  // whatever it wrote in the meantime gets deleted along with the rest.
  if (provider === "plex") await waitForPlexSync(adminUserId);
  else if (provider === "jellyfin") await waitForJellyfinSync(adminUserId);
  else if (provider === "sonarr" || provider === "radarr") await waitForArrSync(adminUserId, provider);

  if (provider === "plex") {
    // Cascades to plex_library_items via its own FK.
    await db.delete(plexServers).where(eq(plexServers.userId, adminUserId));
  } else if (provider === "jellyfin") {
    await db.delete(jellyfinServers).where(eq(jellyfinServers.userId, adminUserId));
  } else if (provider === "sonarr" || provider === "radarr") {
    await db
      .delete(arrStatusCache)
      .where(and(eq(arrStatusCache.userId, adminUserId), eq(arrStatusCache.provider, provider)));
  }
  // A 4K instance has no synced data: it's read live (lib/arr/fourk.ts).

  revalidateIntegrations();
  revalidatePath("/discover");
}

export async function testAndSaveJellyfinConnection(
  adminUserId: string,
  input: { baseUrl: string; apiKey: string },
): Promise<CoreResult> {
  const baseUrl = normalizeServerUrl(input.baseUrl);
  const apiKey = input.apiKey.trim();
  if (!baseUrl || !apiKey) {
    return fail("invalid", "URL and API key are required.");
  }

  try {
    await jellyfin.testConnection({ baseUrl, apiKey });
  } catch {
    return fail("upstream", "Couldn't connect. Check the URL and API key and try again.");
  }

  await upsertJellyfinCredential(adminUserId, { baseUrl, apiKey });
  revalidateIntegrations();
  return { ok: true };
}

export async function startPlexAuthFor(adminUserId: string): Promise<CoreResult<{ authUrl: string; pinId: number }>> {
  const clientId = await getOrCreatePlexClientId(adminUserId);

  try {
    const pin = await plex.createPin(clientId);
    return { ok: true, authUrl: plex.buildPlexAuthUrl(clientId, pin.code), pinId: pin.id };
  } catch {
    return fail("upstream", "Couldn't start Plex sign-in. Try again.");
  }
}

export type PlexAuthCheck = { connected: boolean; movieCount?: number; tvCount?: number };

/** One poll of a Plex PIN sign-in. Returns connected: false until the user
 * finishes signing in on plex.tv; on success saves the token and runs a first
 * library sync. */
export async function checkPlexAuthFor(adminUserId: string, pinId: number): Promise<PlexAuthCheck> {
  const clientId = await getOrCreatePlexClientId(adminUserId);

  const pin = await plex.checkPin(clientId, pinId).catch(() => null);
  if (!pin?.authToken) return { connected: false };

  // A (re)connect may be a different Plex account. The new token goes in
  // first, so a sync still running on the old one stops at its next check;
  // then the old servers are cleared and the new account's synced.
  await upsertPlexCredential(adminUserId, { authToken: pin.authToken, clientId });
  await resyncPlexLibraryFromScratch(adminUserId).catch(() => undefined);

  const summary = await getPlexSummary(adminUserId);

  revalidateIntegrations();

  return { connected: true, movieCount: summary.movieCount, tvCount: summary.tvCount };
}

/** Forces an immediate sync of every integration this user has connected,
 * bypassing the usual 15-minute staleness gate. */
export async function syncNowForUser(userId: string): Promise<CoreResult> {
  const [plexCred, jellyfinCred, sonarrCred, radarrCred] = await Promise.all([
    getPlexCredential(userId),
    getJellyfinCredential(userId),
    getArrCredential(userId, "sonarr"),
    getArrCredential(userId, "radarr"),
  ]);

  const results = await Promise.allSettled([
    plexCred ? syncPlexLibrary(userId) : Promise.resolve(),
    jellyfinCred ? syncJellyfinLibrary(userId) : Promise.resolve(),
    sonarrCred ? syncArrLibrary(userId, "sonarr") : Promise.resolve(),
    radarrCred ? syncArrLibrary(userId, "radarr") : Promise.resolve(),
  ]);

  const failed = results.some((r) => r.status === "rejected");

  revalidateIntegrations();
  return failed ? fail("upstream", "Some integrations failed to sync — check their connection.") : { ok: true };
}

export async function testAndSaveTmdbToken(rawToken: string): Promise<CoreResult> {
  const token = rawToken.trim();
  if (!token) return fail("invalid", "Enter an access token.");

  const valid = await verifyTmdbAccessToken(token).catch(() => false);
  if (!valid) return fail("invalid", "Couldn't verify this token with TMDb. Check it and try again.");

  await setTmdbAccessToken(token);
  revalidateIntegrations();
  return { ok: true };
}

export async function testAndSaveTraktClientId(rawClientId: string): Promise<CoreResult> {
  const clientId = rawClientId.trim();
  if (!clientId) return fail("invalid", "Enter a Trakt client id.");

  const valid = await verifyTraktClientId(clientId).catch(() => false);
  if (!valid) return fail("invalid", "Couldn't verify this client id with Trakt. Check it and try again.");

  await setTraktClientId(clientId);
  revalidateIntegrations();
  return { ok: true };
}

export async function testAndSaveTvdbApiKey(rawApiKey: string): Promise<CoreResult> {
  const apiKey = rawApiKey.trim();
  if (!apiKey) return fail("invalid", "Enter a TheTVDB API key.");

  const valid = await verifyTvdbApiKey(apiKey).catch(() => false);
  if (!valid) return fail("invalid", "Couldn't verify this key with TheTVDB. Check it and try again.");

  await setTvdbApiKey(apiKey);
  revalidateIntegrations();
  return { ok: true };
}

export async function testAndSaveDiscordWebhook(rawUrl: string): Promise<CoreResult> {
  const webhookUrl = rawUrl.trim();
  if (!webhookUrl) return fail("invalid", "Enter a Discord webhook URL.");
  if (!webhookUrl.startsWith("https://discord.com/api/webhooks/")) {
    return fail("invalid", "That doesn't look like a Discord webhook URL.");
  }

  const valid = await verifyDiscordWebhook(webhookUrl);
  if (!valid) return fail("invalid", "Couldn't post a test message to that webhook. Check it and try again.");

  await setDiscordWebhookUrl(webhookUrl);
  revalidateIntegrations();
  return { ok: true };
}

export async function testAndSaveNtfyTopic(rawUrl: string): Promise<CoreResult> {
  const topicUrl = rawUrl.trim();
  if (!topicUrl) return fail("invalid", "Enter your ntfy topic URL.");
  if (!topicUrl.startsWith("http://") && !topicUrl.startsWith("https://")) {
    return fail("invalid", "Enter a full URL, e.g. https://ntfy.sh/your-topic-name.");
  }

  const valid = await verifyNtfyUrl(topicUrl);
  if (!valid) return fail("invalid", "Couldn't post a test message to that topic. Check it and try again.");

  await setNtfyUrl(topicUrl);
  revalidateIntegrations();
  return { ok: true };
}

export async function testAndSaveGenericWebhookUrl(rawUrl: string): Promise<CoreResult> {
  const webhookUrl = rawUrl.trim();
  if (!webhookUrl) return fail("invalid", "Enter a webhook URL.");
  if (!webhookUrl.startsWith("http://") && !webhookUrl.startsWith("https://")) {
    return fail("invalid", "Enter a valid URL, starting with http:// or https://.");
  }

  const valid = await verifyWebhookUrl(webhookUrl);
  if (!valid) return fail("invalid", "Couldn't post a test request to that URL. Check it and try again.");

  await setGenericWebhookUrl(webhookUrl);
  revalidateIntegrations();
  return { ok: true };
}

/** Runs a "clear saved setting" function and revalidates the page. */
export async function clearIntegrationSetting(clear: () => Promise<void>): Promise<void> {
  await clear();
  revalidateIntegrations();
}
