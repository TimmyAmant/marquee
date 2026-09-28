import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { integrationCredentials, plexServers, jellyfinServers } from "@/lib/db/schema";
import type { ArrInstance, IntegrationProvider } from "@/lib/db/schema";
import { arrInstanceLabel, arrKindOf, isFourK } from "@/lib/arr/instances";
import { hasArrServer, listArrServers } from "@/lib/arr/servers";
import {
  deleteDefaultServer,
  getArrServerOptions,
  saveDefaultServerConnection,
  saveDefaultServerDefaults,
} from "@/lib/arr/server-manage";
import { normalizeServerUrl } from "@/lib/arr/server-input";
import {
  getOrCreatePlexClientId,
  getPlexCredential,
  getJellyfinCredential,
  upsertJellyfinCredential,
  upsertPlexCredential,
} from "@/lib/integrations/credentials";
import {
  setTmdbAccessToken,
  setTraktClientId,
  setTvdbApiKey,
  setOmdbApiKey,
  setDiscordWebhookUrl,
  setGenericWebhookUrl,
  setNtfyUrl,
} from "@/lib/integrations/app-settings";
import * as jellyfin from "@/lib/jellyfin/client";
import * as plex from "@/lib/plex/client";
import { syncPlexLibrary, getPlexSummary, resyncPlexLibraryFromScratch, waitForPlexSync } from "@/lib/plex/sync";
import { syncJellyfinLibrary, waitForJellyfinSync } from "@/lib/jellyfin/sync";
import { syncArrLibrary } from "@/lib/arr/sync";
import { verifyTmdbAccessToken } from "@/lib/tmdb/client";
import { verifyTraktClientId } from "@/lib/trakt/client";
import { verifyTvdbApiKey } from "@/lib/tvdb/client";
import { verifyOmdbApiKey } from "@/lib/ratings/omdb";
import { verifyDiscordWebhook } from "@/lib/discord/client";
import { verifyNtfyUrl } from "@/lib/ntfy/client";
import { verifyWebhookUrl } from "@/lib/webhook/client";
import type { CoreResult } from "@/lib/core-result";
import { failT } from "@/lib/core-failure";

/** Settings' "Test" button: check the connection (and send any test
 * message) without saving it. */
export type TestOptions = { dryRun?: boolean };

// Settings → Integrations operations shared by the web's server actions
// (app/settings/integrations/*-actions.ts) and /api/v1/settings/integrations/*.
// Every function here assumes the caller already verified the actor is the
// admin (except syncNowForUser, which only ever touches the caller's own
// integrations) and does its own input validation with the web's messages.

function isArrInstance(provider: IntegrationProvider): provider is ArrInstance {
  return provider === "sonarr" || provider === "radarr" || provider === "sonarr4k" || provider === "radarr4k";
}

export function revalidateIntegrations() {
  revalidatePath("/settings", "layout");
}

export { normalizeServerUrl } from "@/lib/arr/server-input";

export type ArrOptions = {
  rootFolders: { id: number; path: string }[];
  qualityProfiles: { id: number; name: string }[];
};

export type ArrConnectionResult = ArrOptions & {
  baseUrl: string;
  selectedRootFolder: string | null;
  selectedQualityProfileId: number | null;
};

// The one-server-per-provider settings of 0.37 (the website's older cards
// and PUT /api/v1/settings/integrations/{provider}): each now acts on the
// default server of that kind and 4K-ness (lib/arr/server-manage.ts).

export async function testAndSaveArrConnection(
  adminUserId: string,
  provider: ArrInstance,
  input: { baseUrl: string; apiKey: string },
): Promise<CoreResult<ArrConnectionResult>> {
  const baseUrl = normalizeServerUrl(input.baseUrl);
  const apiKey = input.apiKey.trim();
  if (!baseUrl || !apiKey) {
    return await failT("invalid", "server.urlAndKeyRequired");
  }
  const result = await saveDefaultServerConnection(adminUserId, arrKindOf(provider), isFourK(provider), {
    baseUrl,
    apiKey,
  });
  if (!result.ok) return result;
  revalidateIntegrations();
  return {
    ok: true,
    baseUrl,
    rootFolders: result.check.rootFolders,
    qualityProfiles: result.check.qualityProfiles,
    selectedRootFolder: result.server.rootFolderPath,
    selectedQualityProfileId: result.server.qualityProfileId,
  };
}

/** Root folders + quality profiles of the default server — what the older
 * "defaults" pickers are populated with. */
export async function getArrOptions(adminUserId: string, provider: ArrInstance): Promise<CoreResult<ArrOptions>> {
  const [server] = await listArrServers(adminUserId, { kind: arrKindOf(provider), fourK: isFourK(provider) });
  const label = arrInstanceLabel(provider);
  if (!server) return await failT("conflict", "server.connectInSettingsFirst", { name: label });
  const options = await getArrServerOptions(adminUserId, server.id);
  if (!options.ok) return await failT("upstream", "server.arrUnreachable", { name: label });
  return { ok: true, rootFolders: options.rootFolders, qualityProfiles: options.qualityProfiles };
}

export async function saveArrDefaultsFor(
  adminUserId: string,
  provider: ArrInstance,
  input: { rootFolderPath: string; qualityProfileId: number },
): Promise<CoreResult> {
  if (!input.rootFolderPath || !Number.isFinite(input.qualityProfileId)) {
    return await failT("invalid", "server.pickRootAndProfile");
  }
  const result = await saveDefaultServerDefaults(adminUserId, arrKindOf(provider), isFourK(provider), input);
  if (!result.ok) return result;
  revalidateIntegrations();
  return { ok: true };
}

/** Removes a saved integration entirely — the credential row, plus whatever
 * synced data that provider owns, so a disconnected integration doesn't
 * leave stale "owned"/"tracked" statuses lingering around afterward. */
export async function disconnectIntegration(adminUserId: string, provider: IntegrationProvider): Promise<void> {
  if (isArrInstance(provider)) {
    // The older per-provider Disconnect: removes that default server.
    await deleteDefaultServer(adminUserId, arrKindOf(provider), isFourK(provider));
    revalidateIntegrations();
    return;
  }

  await db
    .delete(integrationCredentials)
    .where(and(eq(integrationCredentials.userId, adminUserId), eq(integrationCredentials.provider, provider)));

  // A sync already running would keep writing rows after the deletes below
  // and bring the library back. With the credential gone it stops at its
  // next still-connected check, so wait for that before clearing its data —
  // whatever it wrote in the meantime gets deleted along with the rest.
  if (provider === "plex") await waitForPlexSync(adminUserId);
  else if (provider === "jellyfin") await waitForJellyfinSync(adminUserId);

  if (provider === "plex") {
    // Cascades to plex_library_items via its own FK.
    await db.delete(plexServers).where(eq(plexServers.userId, adminUserId));
  } else if (provider === "jellyfin") {
    await db.delete(jellyfinServers).where(eq(jellyfinServers.userId, adminUserId));
  }

  revalidateIntegrations();
  revalidatePath("/discover");
}

export async function testAndSaveJellyfinConnection(
  adminUserId: string,
  input: { baseUrl: string; apiKey: string; publicUrl?: string | null },
  options: TestOptions = {},
): Promise<CoreResult> {
  const baseUrl = normalizeServerUrl(input.baseUrl);
  const apiKey = input.apiKey.trim();
  if (!baseUrl || !apiKey) {
    return await failT("invalid", "server.urlAndKeyRequired");
  }
  // Optional: where "Play on Jellyfin" opens, when that isn't `baseUrl`.
  const publicUrl = input.publicUrl ? normalizeServerUrl(input.publicUrl) : null;
  if (publicUrl && !/^https?:\/\/\S+$/.test(publicUrl)) {
    return await failT("invalid", "server.publicUrlInvalid");
  }

  try {
    await jellyfin.testConnection({ baseUrl, apiKey });
  } catch {
    return await failT("upstream", "server.couldNotConnect");
  }

  // "Test": everything but the save.
  if (options.dryRun) return { ok: true };
  await upsertJellyfinCredential(adminUserId, { baseUrl, apiKey, publicUrl: publicUrl || null });
  revalidateIntegrations();
  return { ok: true };
}

export async function startPlexAuthFor(adminUserId: string): Promise<CoreResult<{ authUrl: string; pinId: number }>> {
  const clientId = await getOrCreatePlexClientId(adminUserId);

  try {
    const pin = await plex.createPin(clientId);
    return { ok: true, authUrl: plex.buildPlexAuthUrl(clientId, pin.code), pinId: pin.id };
  } catch {
    return await failT("upstream", "server.plexStartFailed");
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
    hasArrServer(userId, "sonarr", false),
    hasArrServer(userId, "radarr", false),
  ]);

  const results = await Promise.allSettled([
    plexCred ? syncPlexLibrary(userId) : Promise.resolve(),
    jellyfinCred ? syncJellyfinLibrary(userId) : Promise.resolve(),
    sonarrCred ? syncArrLibrary(userId, "sonarr") : Promise.resolve(),
    radarrCred ? syncArrLibrary(userId, "radarr") : Promise.resolve(),
  ]);

  const failed = results.some((r) => r.status === "rejected");

  revalidateIntegrations();
  return failed ? await failT("upstream", "server.someSyncsFailed") : { ok: true };
}

export async function testAndSaveTmdbToken(rawToken: string, options: TestOptions = {}): Promise<CoreResult> {
  const token = rawToken.trim();
  if (!token) return await failT("invalid", "server.enterAccessToken");

  const valid = await verifyTmdbAccessToken(token).catch(() => false);
  if (!valid) return await failT("invalid", "server.tmdbTokenInvalid");

  // "Test": everything but the save.
  if (options.dryRun) return { ok: true };
  await setTmdbAccessToken(token);
  revalidateIntegrations();
  return { ok: true };
}

export async function testAndSaveTraktClientId(rawClientId: string, options: TestOptions = {}): Promise<CoreResult> {
  const clientId = rawClientId.trim();
  if (!clientId) return await failT("invalid", "server.enterTraktClientId");

  const valid = await verifyTraktClientId(clientId).catch(() => false);
  if (!valid) return await failT("invalid", "server.traktClientIdInvalid");

  // "Test": everything but the save.
  if (options.dryRun) return { ok: true };
  await setTraktClientId(clientId);
  revalidateIntegrations();
  return { ok: true };
}

export async function testAndSaveTvdbApiKey(rawApiKey: string, options: TestOptions = {}): Promise<CoreResult> {
  const apiKey = rawApiKey.trim();
  if (!apiKey) return await failT("invalid", "server.enterTvdbKey");

  const valid = await verifyTvdbApiKey(apiKey).catch(() => false);
  if (!valid) return await failT("invalid", "server.tvdbKeyInvalid");

  // "Test": everything but the save.
  if (options.dryRun) return { ok: true };
  await setTvdbApiKey(apiKey);
  revalidateIntegrations();
  return { ok: true };
}

/** Settings › Integrations › OMDb (ratings): the key is tried against OMDb
 * before it's saved. */
export async function testAndSaveOmdbApiKey(rawApiKey: string, options: TestOptions = {}): Promise<CoreResult> {
  const apiKey = rawApiKey.trim();
  if (!apiKey) return await failT("invalid", "server.enterOmdbKey");

  let valid: boolean;
  try {
    valid = await verifyOmdbApiKey(apiKey);
  } catch {
    return await failT("upstream", "server.omdbUnreachable");
  }
  if (!valid) return await failT("invalid", "server.omdbKeyInvalid");

  // "Test": everything but the save.
  if (options.dryRun) return { ok: true };
  await setOmdbApiKey(apiKey);
  revalidateIntegrations();
  return { ok: true };
}

export async function testAndSaveDiscordWebhook(rawUrl: string, options: TestOptions = {}): Promise<CoreResult> {
  const webhookUrl = rawUrl.trim();
  if (!webhookUrl) return await failT("invalid", "server.enterDiscordWebhook");
  if (!webhookUrl.startsWith("https://discord.com/api/webhooks/")) {
    return await failT("invalid", "server.notDiscordWebhook");
  }

  const valid = await verifyDiscordWebhook(webhookUrl);
  if (!valid) return await failT("invalid", "server.discordTestFailed");

  // "Test": everything but the save.
  if (options.dryRun) return { ok: true };
  await setDiscordWebhookUrl(webhookUrl);
  revalidateIntegrations();
  return { ok: true };
}

export async function testAndSaveNtfyTopic(rawUrl: string, options: TestOptions = {}): Promise<CoreResult> {
  const topicUrl = rawUrl.trim();
  if (!topicUrl) return await failT("invalid", "server.enterNtfyTopic");
  if (!topicUrl.startsWith("http://") && !topicUrl.startsWith("https://")) {
    return await failT("invalid", "server.ntfyFullUrl");
  }

  const valid = await verifyNtfyUrl(topicUrl);
  if (!valid) return await failT("invalid", "server.ntfyTestFailed");

  // "Test": everything but the save.
  if (options.dryRun) return { ok: true };
  await setNtfyUrl(topicUrl);
  revalidateIntegrations();
  return { ok: true };
}

export async function testAndSaveGenericWebhookUrl(rawUrl: string, options: TestOptions = {}): Promise<CoreResult> {
  const webhookUrl = rawUrl.trim();
  if (!webhookUrl) return await failT("invalid", "server.enterWebhookUrl");
  if (!webhookUrl.startsWith("http://") && !webhookUrl.startsWith("https://")) {
    return await failT("invalid", "server.webhookUrlInvalid");
  }

  const valid = await verifyWebhookUrl(webhookUrl);
  if (!valid) return await failT("invalid", "server.webhookTestFailed");

  // "Test": everything but the save.
  if (options.dryRun) return { ok: true };
  await setGenericWebhookUrl(webhookUrl);
  revalidateIntegrations();
  return { ok: true };
}

/** Runs a "clear saved setting" function and revalidates the page. */
export async function clearIntegrationSetting(clear: () => Promise<void>): Promise<void> {
  await clear();
  revalidateIntegrations();
}
