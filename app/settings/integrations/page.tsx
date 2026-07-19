import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/auth";
import { getArrCredential, getOrCreateWebhookSecret, getJellyfinCredential } from "@/lib/integrations/credentials";
import { getPlexSummary, syncPlexLibraryIfStale } from "@/lib/plex/sync";
import { getJellyfinSummary, syncJellyfinLibraryIfStale } from "@/lib/jellyfin/sync";
import { syncArrLibraryIfStale } from "@/lib/arr/sync";
import { isTmdbAccessTokenSavedInSettings, getTraktClientId, getTvdbApiKey, getDiscordWebhookUrl } from "@/lib/integrations/app-settings";
import { ArrCredentialForm } from "@/components/arr-credential-form";
import { PlexConnectCard } from "@/components/plex-connect-card";
import { JellyfinConnectCard } from "@/components/jellyfin-connect-card";
import { TmdbSettingsForm } from "@/components/tmdb-settings-form";
import { TraktConnectCard } from "@/components/trakt-connect-card";
import { TvdbConnectCard } from "@/components/tvdb-connect-card";
import { DiscordConnectCard } from "@/components/discord-connect-card";
import { SyncNowButton } from "@/components/sync-now-button";
import { WebhookSettingsCard } from "@/components/webhook-settings-card";

export default async function IntegrationsSettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "admin") redirect("/settings");

  await Promise.all([
    syncPlexLibraryIfStale(session.user.id),
    syncJellyfinLibraryIfStale(session.user.id),
    syncArrLibraryIfStale(session.user.id),
  ]);

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
    headerList,
    discordWebhookUrl,
  ] = await Promise.all([
    getArrCredential(session.user.id, "sonarr"),
    getArrCredential(session.user.id, "radarr"),
    getPlexSummary(session.user.id),
    getJellyfinCredential(session.user.id),
    getJellyfinSummary(session.user.id),
    isTmdbAccessTokenSavedInSettings(),
    getTraktClientId(),
    getTvdbApiKey(),
    getOrCreateWebhookSecret(session.user.id),
    headers(),
    getDiscordWebhookUrl(),
  ]);

  const proto = headerList.get("x-forwarded-proto") ?? "http";
  const host = headerList.get("host");
  const baseUrl = `${proto}://${host}`;

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

      <div className="mt-6 flex flex-col gap-6">
        <TmdbSettingsForm
          savedInSettings={tmdbSavedInSettings}
          configuredFromEnv={Boolean(process.env.TMDB_ACCESS_TOKEN || process.env.TMDB_API_KEY)}
        />
        <TraktConnectCard connected={Boolean(traktClientId)} />
        <TvdbConnectCard connected={Boolean(tvdbApiKey)} />
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
          existing={jellyfinCred ? { baseUrl: jellyfinCred.baseUrl, hasApiKey: true } : null}
          summary={{
            servers: jellyfinSummary.servers.map((s) => ({
              name: s.name,
              lastSyncedAt: s.lastSyncedAt ? s.lastSyncedAt.toISOString() : null,
            })),
            movieCount: jellyfinSummary.movieCount,
            tvCount: jellyfinSummary.tvCount,
          }}
        />
        <ArrCredentialForm
          provider="sonarr"
          label="Sonarr"
          existing={
            sonarrCred
              ? {
                  baseUrl: sonarrCred.baseUrl,
                  hasApiKey: true,
                  rootFolderPath: sonarrCred.rootFolderPath,
                  qualityProfileId: sonarrCred.qualityProfileId,
                }
              : null
          }
        />
        <ArrCredentialForm
          provider="radarr"
          label="Radarr"
          existing={
            radarrCred
              ? {
                  baseUrl: radarrCred.baseUrl,
                  hasApiKey: true,
                  rootFolderPath: radarrCred.rootFolderPath,
                  qualityProfileId: radarrCred.qualityProfileId,
                }
              : null
          }
        />
        <WebhookSettingsCard
          userId={session.user.id}
          initialSecret={webhookSecret}
          baseUrl={baseUrl}
        />
        <DiscordConnectCard connected={Boolean(discordWebhookUrl)} />
      </div>
    </div>
  );
}
