import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getArrCredential } from "@/lib/integrations/credentials";
import { getPlexSummary, syncPlexLibraryIfStale } from "@/lib/plex/sync";
import { syncArrLibraryIfStale } from "@/lib/arr/sync";
import { ArrCredentialForm } from "@/components/arr-credential-form";
import { PlexConnectCard } from "@/components/plex-connect-card";

export default async function IntegrationsSettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  await Promise.all([
    syncPlexLibraryIfStale(session.user.id),
    syncArrLibraryIfStale(session.user.id),
  ]);

  const [sonarrCred, radarrCred, plexSummary] = await Promise.all([
    getArrCredential(session.user.id, "sonarr"),
    getArrCredential(session.user.id, "radarr"),
    getPlexSummary(session.user.id),
  ]);

  return (
    <div>
      <h2 className="font-display text-xl text-text-primary">Integrations</h2>
      <p className="mt-2 text-sm text-text-secondary">
        Connect your own Plex, Sonarr, and Radarr so Marquee knows what you already own and can
        send the rest straight to your download queue. Credentials are encrypted and only ever
        used on your behalf.
      </p>

      <div className="mt-6 flex flex-col gap-6">
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
      </div>
    </div>
  );
}
