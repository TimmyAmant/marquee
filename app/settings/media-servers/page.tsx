import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { loadIntegrationsPage } from "@/lib/pages/settings";
import { PlexConnectCard } from "@/components/plex-connect-card";
import { JellyfinConnectCard } from "@/components/jellyfin-connect-card";
import { SyncNowButton } from "@/components/sync-now-button";
import { getT } from "@/lib/i18n/server";
import { SettingsHeader, SettingsSection } from "@/components/settings/settings-ui";

/** Settings › Media servers, the admin's: Plex and Jellyfin, what the
 * household already owns. */
export default async function MediaServersSettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "admin") redirect("/settings");

  // Shared with GET /api/v1/settings/integrations; also starts any stale sync.
  const [{ plexSummary, jellyfin }, t] = await Promise.all([loadIntegrationsPage(session.user.id), getT()]);

  return (
    <div>
      <SettingsHeader
        title={t("nav.settingsMediaServers")}
        description={t("settings.mediaServersIntro")}
        actions={<SyncNowButton />}
      />

      <SettingsSection>
        <div className="grid gap-4 lg:grid-cols-2">
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
            name={jellyfin.existing && jellyfin.summary.servers.length > 0 ? jellyfin.name : null}
          />
        </div>
      </SettingsSection>
    </div>
  );
}
