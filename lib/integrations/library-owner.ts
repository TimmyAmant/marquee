import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { getArrCredential, getPlexCredential } from "@/lib/integrations/credentials";

/**
 * Resolves which user's synced Plex/Sonarr/Radarr data should be treated as
 * "the household library" for ownership/status lookups. In this app's
 * shared-household model only the admin connects Plex/Sonarr/Radarr — a
 * member has no integrations of their own, so scoping status queries to
 * their own userId (as if every user ran independent instances) makes
 * everything look untracked even when the shared library already has it.
 * Falls back to the current user's own id if they do have credentials
 * configured (e.g. a future multi-instance setup), or if no admin exists.
 */
export async function getLibraryOwnerUserId(userId: string): Promise<string> {
  const [plex, sonarr, radarr] = await Promise.all([
    getPlexCredential(userId),
    getArrCredential(userId, "sonarr"),
    getArrCredential(userId, "radarr"),
  ]);
  if (plex || sonarr || radarr) return userId;

  const [admin] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, "admin"))
    .limit(1);
  return admin?.id ?? userId;
}
