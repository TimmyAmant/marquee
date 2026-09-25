import { getWatchlistState } from "@/lib/plex/watchlist";
import type { PlexWatchlist } from "@/lib/api/types";

export async function plexWatchlistDto(userId: string): Promise<PlexWatchlist> {
  const state = await getWatchlistState(userId);
  return { ...state, lastSyncedAt: state.lastSyncedAt?.toISOString() ?? null };
}
