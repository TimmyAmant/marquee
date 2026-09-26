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

  cron.schedule("0 * * * *", () => {
    syncAllConnectedPlexUsers().catch((err) => {
      console.error("[plex-sync] scheduled sync failed:", err);
    });
    syncAllConnectedJellyfinUsers().catch((err) => {
      console.error("[jellyfin-sync] scheduled sync failed:", err);
    });
    syncAllConnectedArrUsers().catch((err) => {
      console.error("[arr-sync] scheduled sync failed:", err);
    });
  });

  // Often enough that adding something to a Plex Watchlist feels like
  // requesting it; an unchanged watchlist costs one 304 from plex.tv.
  cron.schedule("5-59/10 * * * *", () => {
    syncAllPlexWatchlists().catch((err) => {
      console.error("[plex-watchlist] scheduled sync failed:", err);
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
