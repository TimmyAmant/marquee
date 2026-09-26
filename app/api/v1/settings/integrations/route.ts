import { withApi } from "@/lib/api/handler";
import { requireApiAdmin } from "@/lib/api/auth";
import { syncedServers } from "@/lib/api/mappers";
import { INTEGRATIONS_FORBIDDEN } from "@/lib/api/routes/integrations";
import { loadIntegrationsPage } from "@/lib/pages/settings";
import { arrWebhookUrls, webhookBaseUrl } from "@/lib/integrations/webhook-urls";
import type { ArrSettings, IntegrationsSettings } from "@/lib/api/types";

function arrSettings(
  existing: { baseUrl: string; hasApiKey: boolean; rootFolderPath: string | null; qualityProfileId: number | null } | null,
): ArrSettings {
  return {
    connected: Boolean(existing),
    baseUrl: existing?.baseUrl ?? null,
    hasApiKey: existing?.hasApiKey ?? false,
    rootFolderPath: existing?.rootFolderPath ?? null,
    qualityProfileId: existing?.qualityProfileId ?? null,
    fullyConfigured: Boolean(existing?.qualityProfileId && existing?.rootFolderPath),
  };
}

/** Settings → Integrations (admin). Like the page, first re-syncs any
 * library data older than 15 minutes, so this can take a few seconds. API
 * keys and tokens are never returned — only whether one is saved. The
 * Sonarr/Radarr webhook URLs (which embed the admin's own webhook secret) are
 * built from this request's Host / X-Forwarded-Proto. */
export const GET = withApi(async (request): Promise<IntegrationsSettings> => {
  const ctx = await requireApiAdmin(request, INTEGRATIONS_FORBIDDEN);
  const data = await loadIntegrationsPage(ctx.user.id);
  const urls = arrWebhookUrls(webhookBaseUrl(request.headers), ctx.user.id, data.webhookSecret);

  return {
    plex: {
      connected: data.plexSummary.connected,
      servers: syncedServers(data.plexSummary.servers),
      movieCount: data.plexSummary.movieCount,
      tvCount: data.plexSummary.tvCount,
      totalBytes: data.plexSummary.totalBytes,
    },
    jellyfin: {
      connected: Boolean(data.jellyfin.existing),
      baseUrl: data.jellyfin.existing?.baseUrl ?? null,
      hasApiKey: data.jellyfin.existing?.hasApiKey ?? false,
      servers: syncedServers(data.jellyfin.summary.servers),
      movieCount: data.jellyfin.summary.movieCount,
      tvCount: data.jellyfin.summary.tvCount,
      totalBytes: data.jellyfin.summary.totalBytes,
    },
    sonarr: arrSettings(data.sonarr),
    radarr: arrSettings(data.radarr),
    tmdb: {
      connected: data.tmdb.savedInSettings || data.tmdb.configuredFromEnv,
      savedInSettings: data.tmdb.savedInSettings,
      configuredFromEnv: data.tmdb.configuredFromEnv,
    },
    trakt: { connected: data.traktConnected },
    tvdb: { connected: data.tvdbConnected },
    discord: { connected: data.discordConnected },
    ntfy: { connected: data.ntfyConnected },
    telegram: data.channels.telegram,
    pushover: data.channels.pushover,
    email: data.channels.email,
    genericWebhook: { connected: data.genericWebhookConnected },
    arrWebhooks: { secret: data.webhookSecret, radarrUrl: urls.radarr, sonarrUrl: urls.sonarr },
  };
});
