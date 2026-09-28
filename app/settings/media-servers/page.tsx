import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { loadIntegrationsPage } from "@/lib/pages/settings";
import { MediaServerTiles } from "@/components/media-server-tiles";
import { SyncNowButton } from "@/components/sync-now-button";
import { getT } from "@/lib/i18n/server";
import { SettingsHeader } from "@/components/settings/settings-ui";

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

      <MediaServerTiles
        plex={{
          connected: plexSummary.connected,
          servers: plexSummary.servers.map((s) => ({
            name: s.name,
            lastSyncedAt: s.lastSyncedAt ? s.lastSyncedAt.toISOString() : null,
          })),
          movieCount: plexSummary.movieCount,
          tvCount: plexSummary.tvCount,
        }}
        jellyfin={{
          existing: jellyfin.existing,
          name: jellyfin.existing && jellyfin.summary.servers.length > 0 ? jellyfin.name : null,
          servers: jellyfin.summary.servers.map((s) => ({
            name: s.name,
            lastSyncedAt: s.lastSyncedAt ? s.lastSyncedAt.toISOString() : null,
          })),
          movieCount: jellyfin.summary.movieCount,
          tvCount: jellyfin.summary.tvCount,
        }}
      />
    </div>
  );
}
