import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/auth";
import { loadIntegrationsPage } from "@/lib/pages/settings";
import { webhookBaseUrl } from "@/lib/integrations/webhook-urls";
import { ArrCredentialForm } from "@/components/arr-credential-form";
import { PlexConnectCard } from "@/components/plex-connect-card";
import { JellyfinConnectCard } from "@/components/jellyfin-connect-card";
import { TmdbSettingsForm } from "@/components/tmdb-settings-form";
import { TraktConnectCard } from "@/components/trakt-connect-card";
import { TvdbConnectCard } from "@/components/tvdb-connect-card";
import { DiscordConnectCard } from "@/components/discord-connect-card";
import { NtfyConnectCard } from "@/components/ntfy-connect-card";
import { NotificationChannelCards } from "@/components/notification-channel-cards";
import { WebhookConnectCard } from "@/components/webhook-connect-card";
import { SyncNowButton } from "@/components/sync-now-button";
import { WebhookSettingsCard } from "@/components/webhook-settings-card";

export default async function IntegrationsSettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "admin") redirect("/settings");

  // Shared with GET /api/v1/settings/integrations.
  const [
    {
      plexSummary,
      jellyfin,
      sonarr,
      radarr,
      tmdb,
      traktConnected,
      tvdbConnected,
      webhookSecret,
      discordConnected,
      genericWebhookConnected,
      ntfyConnected,
      channels,
    },
    headerList,
  ] = await Promise.all([loadIntegrationsPage(session.user.id), headers()]);

  const baseUrl = webhookBaseUrl(headerList);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-xl text-text-primary">Integrations</h2>
          <p className="mt-2 text-sm text-text-secondary">
            Connect your own Plex, Jellyfin, Sonarr, and Radarr so Marquee knows what you already
            own and can send the rest straight to your download queue. Credentials are encrypted
            and only ever used on your behalf.
          </p>
        </div>
        <SyncNowButton />
      </div>

      <div className="mt-6 flex flex-col gap-10">
        <section>
          <h3 className="text-xs font-medium uppercase tracking-wider text-text-muted">
            Media Libraries
          </h3>
          <div className="mt-3 flex flex-col gap-6">
            <PlexConnectCard
              initialConnected={plexSummary.connected}
              initialServers={plexSummary.servers.map((s) => ({
                name: s.name,
                lastSyncedAt: s.lastSyncedAt ? s.lastSyncedAt.toISOString() : null,
              }))}
              initialMovieCount={plexSummary.movieCount}
              initialTvCount={plexSummary.tvCount}
            />
            <JellyfinConnectCard
              existing={jellyfin.existing}
              summary={{
                servers: jellyfin.summary.servers.map((s) => ({
                  name: s.name,
                  lastSyncedAt: s.lastSyncedAt ? s.lastSyncedAt.toISOString() : null,
                })),
                movieCount: jellyfin.summary.movieCount,
                tvCount: jellyfin.summary.tvCount,
              }}
            />
          </div>
        </section>

        <section>
          <h3 className="text-xs font-medium uppercase tracking-wider text-text-muted">
            Download Clients
          </h3>
          <div className="mt-3 flex flex-col gap-6">
            <ArrCredentialForm provider="sonarr" label="Sonarr" existing={sonarr} />
            <ArrCredentialForm provider="radarr" label="Radarr" existing={radarr} />
          </div>
        </section>

        <section>
          <h3 className="text-xs font-medium uppercase tracking-wider text-text-muted">
            Metadata Sources
          </h3>
          <div className="mt-3 flex flex-col gap-6">
            <TmdbSettingsForm
              savedInSettings={tmdb.savedInSettings}
              configuredFromEnv={tmdb.configuredFromEnv}
            />
            <TraktConnectCard connected={traktConnected} />
            <TvdbConnectCard connected={tvdbConnected} />
          </div>
        </section>

        <section>
          <h3 className="text-xs font-medium uppercase tracking-wider text-text-muted">
            Notifications
          </h3>
          <div className="mt-3 flex flex-col gap-6">
            <WebhookSettingsCard
              userId={session.user.id}
              initialSecret={webhookSecret}
              baseUrl={baseUrl}
            />
            <DiscordConnectCard connected={discordConnected} />
            <NtfyConnectCard connected={ntfyConnected} />
            <NotificationChannelCards channels={channels} />
            <WebhookConnectCard connected={genericWebhookConnected} />
          </div>
        </section>
      </div>
    </div>
  );
}
