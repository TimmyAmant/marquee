import { APP_VERSION } from "@/lib/api/version";
import { getMediaServerName } from "@/lib/jellyfin/product";
import { getChannelSummaries } from "@/lib/notifications/channels";
import type { ViewerIdentity } from "@/lib/integrations/library-owner";
import { getUserLibrary, summarizeLibrary } from "@/lib/library/query";
import { getTotalRequestCount } from "@/lib/requests/query";
import { getArrCredential, getOrCreateWebhookSecret, getJellyfinCredential } from "@/lib/integrations/credentials";
import { getPlexSummary, syncPlexLibraryIfStale } from "@/lib/plex/sync";
import { getJellyfinSummary, syncJellyfinLibraryIfStale } from "@/lib/jellyfin/sync";
import { syncArrLibraryIfStale } from "@/lib/arr/sync";
import { listArrServers } from "@/lib/arr/servers";
import {
  isTmdbAccessTokenSavedInSettings,
  getTraktClientId,
  getTvdbApiKey,
  getDiscordWebhookUrl,
  getGenericWebhookUrl,
  getNtfyUrl,
} from "@/lib/integrations/app-settings";
import type { ActivityEventType } from "@/lib/db/schema";

// Settings-section page data (About, Activity, Integrations) shared between
// app/settings/** and /api/v1/settings/**.

export const REPO_URL = "https://github.com/TimmyAmant/marquee";

/** Settings → About: version, library stats and support links. */
export async function loadAboutPage(viewer: ViewerIdentity) {
  const [library, totalRequests] = await Promise.all([
    viewer.libraryOwnerId ? getUserLibrary(viewer.libraryOwnerId) : Promise.resolve([]),
    getTotalRequestCount(),
  ]);
  const summary = summarizeLibrary(library);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return { version: APP_VERSION, summary, totalRequests, timeZone };
}

/** How Settings → Activity words each event ("Timmy approved Dune"). */
export const ACTIVITY_EVENT_VERBS: Record<ActivityEventType, string> = {
  request_created: "requested",
  request_approved: "approved",
  request_rejected: "declined",
  request_manually_approved: "manually approved",
};

/**
 * Settings → Integrations for the admin: kicks off any stale library sync in
 * the background, then reads every integration's connection state.
 * Secrets never leave this function except as booleans — apart from the
 * admin's own Sonarr/Radarr webhook secret, which the page shows in full.
 */
export async function loadIntegrationsPage(adminUserId: string) {
  // Not awaited: a full sync of a big library takes minutes, and the page
  // only needs the connection state. The counts catch up on the next visit.
  // Each sync already runs single-flight, so repeat visits share one run.
  for (const [name, sync] of [
    ["plex", syncPlexLibraryIfStale],
    ["jellyfin", syncJellyfinLibraryIfStale],
    ["arr", syncArrLibraryIfStale],
  ] as const) {
    sync(adminUserId).catch((err) => {
      console.error(`[settings] background ${name} sync failed for user ${adminUserId}:`, err);
    });
  }

  const [
    sonarrCred,
    radarrCred,
    plexSummary,
    jellyfinCred,
    jellyfinSummary,
    tmdbSavedInSettings,
    traktClientId,
    tvdbApiKey,
    webhookSecret,
    discordWebhookUrl,
    genericWebhookUrl,
    ntfyUrl,
    channels,
    sonarr4kCred,
    radarr4kCred,
    arrServers,
  ] = await Promise.all([
    getArrCredential(adminUserId, "sonarr"),
    getArrCredential(adminUserId, "radarr"),
    getPlexSummary(adminUserId),
    getJellyfinCredential(adminUserId),
    getJellyfinSummary(adminUserId),
    isTmdbAccessTokenSavedInSettings(),
    getTraktClientId(),
    getTvdbApiKey(),
    getOrCreateWebhookSecret(adminUserId),
    getDiscordWebhookUrl(),
    getGenericWebhookUrl(),
    getNtfyUrl(),
    getChannelSummaries(),
    getArrCredential(adminUserId, "sonarr4k"),
    getArrCredential(adminUserId, "radarr4k"),
    listArrServers(adminUserId),
  ]);

  const arrExisting = (cred: typeof sonarrCred) =>
    cred
      ? {
          baseUrl: cred.baseUrl,
          hasApiKey: true,
          rootFolderPath: cred.rootFolderPath,
          qualityProfileId: cred.qualityProfileId,
        }
      : null;

  return {
    plexSummary,
    jellyfin: {
      existing: jellyfinCred ? { baseUrl: jellyfinCred.baseUrl, hasApiKey: true } : null,
      summary: jellyfinSummary,
      /** "Jellyfin" or "Emby" (lib/jellyfin/product.ts). */
      name: await getMediaServerName(adminUserId),
    },
    sonarr: arrExisting(sonarrCred),
    radarr: arrExisting(radarrCred),
    sonarr4k: arrExisting(sonarr4kCred),
    radarr4k: arrExisting(radarr4kCred),
    /** Every Sonarr/Radarr server — the four above are the defaults of each
     * kind and 4K-ness, kept for the older API shape. Carries decrypted
     * keys: callers turn these into toArrServerDto before they leave. */
    arrServers,
    tmdb: {
      savedInSettings: tmdbSavedInSettings,
      configuredFromEnv: Boolean(process.env.TMDB_ACCESS_TOKEN || process.env.TMDB_API_KEY),
    },
    traktConnected: Boolean(traktClientId),
    tvdbConnected: Boolean(tvdbApiKey),
    webhookSecret,
    discordConnected: Boolean(discordWebhookUrl),
    genericWebhookConnected: Boolean(genericWebhookUrl),
    ntfyConnected: Boolean(ntfyUrl),
    channels,
  };
}
