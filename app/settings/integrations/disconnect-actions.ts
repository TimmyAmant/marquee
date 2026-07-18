"use server";

import { revalidatePath } from "next/cache";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { integrationCredentials, plexServers, jellyfinServers, arrStatusCache } from "@/lib/db/schema";
import type { IntegrationProvider } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/require-admin";

export type DisconnectState = { error?: string; success?: boolean };

/** Removes a saved integration entirely — the credential row, plus whatever
 * synced data that provider owns, so a disconnected integration doesn't
 * leave stale "owned"/"tracked" statuses lingering around afterward. */
export async function disconnectIntegrationAction(
  provider: IntegrationProvider,
): Promise<DisconnectState> {
  const admin = await requireAdmin("Only the admin can manage integrations.");
  if (!admin.ok) return { error: admin.error };

  await db
    .delete(integrationCredentials)
    .where(and(eq(integrationCredentials.userId, admin.userId), eq(integrationCredentials.provider, provider)));

  if (provider === "plex") {
    // Cascades to plex_library_items via its own FK.
    await db.delete(plexServers).where(eq(plexServers.userId, admin.userId));
  } else if (provider === "jellyfin") {
    await db.delete(jellyfinServers).where(eq(jellyfinServers.userId, admin.userId));
  } else {
    await db
      .delete(arrStatusCache)
      .where(and(eq(arrStatusCache.userId, admin.userId), eq(arrStatusCache.provider, provider)));
  }

  revalidatePath("/settings/integrations");
  revalidatePath("/library");
  revalidatePath("/discover");
  return { success: true };
}
