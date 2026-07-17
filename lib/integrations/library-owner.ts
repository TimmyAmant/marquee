import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { getArrCredential, getPlexCredential } from "@/lib/integrations/credentials";
import { auth } from "@/auth";
import type { Session } from "next-auth";

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

export type ViewerContext =
  | { session: null; userId: null; isAdmin: false; libraryOwnerId: null }
  | { session: Session; userId: string; isAdmin: boolean; libraryOwnerId: string };

/**
 * Single entry point for the "who's asking, and whose library should they
 * see" question that nearly every page in this app needs to answer. Bundles
 * auth(), the isAdmin check, and getLibraryOwnerUserId() resolution into one
 * call instead of each page re-deriving all three separately — reduces the
 * chance a new page forgets the library-owner resolution and reintroduces
 * the "member sees an empty library" bug this helper was built to fix.
 */
export async function getViewerContext(): Promise<ViewerContext> {
  const session = await auth();
  if (!session?.user) {
    return { session: null, userId: null, isAdmin: false, libraryOwnerId: null };
  }

  const isAdmin = session.user.role === "admin";
  const libraryOwnerId = await getLibraryOwnerUserId(session.user.id);
  return { session, userId: session.user.id, isAdmin, libraryOwnerId };
}
