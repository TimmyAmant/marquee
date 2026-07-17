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
}
