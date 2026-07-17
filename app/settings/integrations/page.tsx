import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/auth";
import { getArrCredential, getOrCreateWebhookSecret } from "@/lib/integrations/credentials";
import { getPlexSummary, syncPlexLibraryIfStale } from "@/lib/plex/sync";
import { syncArrLibraryIfStale } from "@/lib/arr/sync";
import { isTmdbAccessTokenSavedInSettings } from "@/lib/integrations/app-settings";
import { ArrCredentialForm } from "@/components/arr-credential-form";
import { PlexConnectCard } from "@/components/plex-connect-card";
import { TmdbSettingsForm } from "@/components/tmdb-settings-form";
import { SyncNowButton } from "@/components/sync-now-button";
import { WebhookSettingsCard } from "@/components/webhook-settings-card";

export default async function IntegrationsSettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "admin") redirect("/settings");

  await Promise.all([
    syncPlexLibraryIfStale(session.user.id),
    syncArrLibraryIfStale(session.user.id),
  ]);

  const [sonarrCred, radarrCred, plexSummary, tmdbSavedInSettings, webhookSecret, headerList] =
    await Promise.all([
      getArrCredential(session.user.id, "sonarr"),
      getArrCredential(session.user.id, "radarr"),
      getPlexSummary(session.user.id),
      isTmdbAccessTokenSavedInSettings(),
      getOrCreateWebhookSecret(session.user.id),
      headers(),
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
            Connect your own Plex, Sonarr, and Radarr so Marquee knows what you already own and can
            send the rest straight to your download queue. Credentials are encrypted and only ever
            used on your behalf.
          </p>
        </div>
        <SyncNowButton />
      </div>

      <div className="mt-6 flex flex-col gap-6">
        <TmdbSettingsForm
          savedInSettings={tmdbSavedInSettings}
          configuredFromEnv={Boolean(process.env.TMDB_ACCESS_TOKEN || process.env.TMDB_API_KEY)}
        />
        <PlexConnectCard
          initialConnected={plexSummary.connected}
          initialServers={plexSummary.servers.map((s) => ({
            name: s.name,
            lastSyncedAt: s.lastSyncedAt ? s.lastSyncedAt.toISOString() : null,
          }))}
          initialMovieCount={plexSummary.movieCount}
          initialTvCount={plexSummary.tvCount}
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
      </div>
    </div>
  );
}
