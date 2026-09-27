declare global {
  var __marqueeCronStarted: boolean | undefined;
}

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (global.__marqueeCronStarted) return;
  global.__marqueeCronStarted = true;

  const cron = await import("node-cron");
  const { syncAllConnectedPlexUsers } = await import("@/lib/plex/sync");
  const { syncAllConnectedJellyfinUsers } = await import("@/lib/jellyfin/sync");
  const { syncAllConnectedArrUsers } = await import("@/lib/arr/sync");
  const { snapshotDiskSpaceForAllConnectedUsers } = await import("@/lib/integrations/disk-space");
  const { pruneOldRecords } = await import("@/lib/jobs/cleanup");
  const { syncAllPlexWatchlists } = await import("@/lib/plex/watchlist");
  const { checkNotFoundRequests } = await import("@/lib/requests/not-found");
  const { syncAllTraktSyncs } = await import("@/lib/trakt/sync");
  const { checkCompletedRequests } = await import("@/lib/requests/complete");

  const checkComplete = (when: string) =>
    checkCompletedRequests().catch((err) => {
      console.error(`[complete-check] ${when} check failed:`, err);
    });

  cron.schedule("0 * * * *", () => {
    const syncs = [
      syncAllConnectedPlexUsers().catch((err) => {
        console.error("[plex-sync] scheduled sync failed:", err);
      }),
      syncAllConnectedJellyfinUsers().catch((err) => {
        console.error("[jellyfin-sync] scheduled sync failed:", err);
      }),
      syncAllConnectedArrUsers().catch((err) => {
        console.error("[arr-sync] scheduled sync failed:", err);
      }),
    ];
    // "Ready to watch" (lib/requests/complete.ts), once the libraries are
    // fresh: catches whatever a missed or unconfigured webhook didn't.
    void Promise.all(syncs).then(() => checkComplete("scheduled"));
  });

  // Once shortly after starting, so the requests that were already in the
  // library before these notices existed are recorded as told (without
  // telling anyone) before a webhook can come along and announce them.
  setTimeout(() => void checkComplete("startup"), 30_000).unref?.();

  // Often enough that adding something to a Plex Watchlist feels like
  // requesting it; an unchanged watchlist costs one 304 from plex.tv.
  cron.schedule("5-59/10 * * * *", () => {
    syncAllPlexWatchlists().catch((err) => {
      console.error("[plex-watchlist] scheduled sync failed:", err);
    });
  });

  // Trakt lists members keep in sync (lib/trakt/sync.ts). A public list
  // changes slowly and Trakt has no cheap "unchanged" answer like plex.tv's
  // 304, so every few hours rather than every few minutes.
  cron.schedule("40 */3 * * *", () => {
    syncAllTraktSyncs().catch((err) => {
      console.error("[trakt-sync] scheduled sync failed:", err);
    });
  });

  // Approved requests Sonarr/Radarr still hasn't found (lib/requests/not-found.ts).
  // Past the hour's library sync, so a title that turned up is already known.
  cron.schedule("20 * * * *", () => {
    checkNotFoundRequests().catch((err) => {
      console.error("[not-found-check] scheduled check failed:", err);
    });
  });

  // Once a day is plenty for a storage forecast — free space doesn't need
  // hourly resolution the way sync status does.
  cron.schedule("0 3 * * *", () => {
    snapshotDiskSpaceForAllConnectedUsers().catch((err) => {
      console.error("[disk-space-snapshot] scheduled snapshot failed:", err);
    });
  });

  cron.schedule("30 3 * * *", () => {
    pruneOldRecords().catch((err) => {
      console.error("[cleanup] scheduled cleanup failed:", err);
    });
  });
}
