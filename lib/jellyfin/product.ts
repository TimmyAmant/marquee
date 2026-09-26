import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { jellyfinServers } from "@/lib/db/schema";
import type { JellyfinSystemInfo } from "@/lib/jellyfin/client";

// Emby is what Jellyfin was forked from, and still speaks the same API — so
// the "Jellyfin" integration works with an Emby server as it is. The only
// difference people should see is the name: "Sign in with Emby", "Import
// from Emby". Which one it is comes from the server's own /System/Info.

export type MediaServerProduct = "jellyfin" | "emby";

export const MEDIA_SERVER_PRODUCT_NAME: Record<MediaServerProduct, string> = {
  jellyfin: "Jellyfin",
  emby: "Emby",
};

/** Jellyfin says so in ProductName ("Jellyfin Server"); Emby sends none,
 * and numbers its versions 4.x where Jellyfin's are 10.x — so a server
 * with neither sign stays "Jellyfin". Pure; unit tested. */
export function productOf(info: Partial<Pick<JellyfinSystemInfo, "ProductName" | "Version">>): MediaServerProduct {
  if (/jellyfin/i.test(info.ProductName ?? "")) return "jellyfin";
  if (/emby/i.test(info.ProductName ?? "")) return "emby";
  const major = Number.parseInt(info.Version ?? "", 10);
  return !info.ProductName && Number.isFinite(major) && major < 10 ? "emby" : "jellyfin";
}

/** The connected server's name for people: "Emby" or "Jellyfin" (also
 * before the first sync has said which). */
export async function getMediaServerName(adminUserId: string | null): Promise<string> {
  if (!adminUserId) return MEDIA_SERVER_PRODUCT_NAME.jellyfin;
  // The most recently synced server: after a switch to another server the
  // old one's row can linger.
  const [row] = await db
    .select({ product: jellyfinServers.product })
    .from(jellyfinServers)
    .where(eq(jellyfinServers.userId, adminUserId))
    .orderBy(desc(jellyfinServers.lastSyncedAt))
    .limit(1);
  return MEDIA_SERVER_PRODUCT_NAME[row?.product ?? "jellyfin"];
}
