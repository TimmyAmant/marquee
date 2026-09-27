// The lookups behind lib/api/poster-actions.ts, done once per response for
// every title in it rather than once per card.
import type { MediaType } from "@/lib/db/schema";
import type { PosterActionRules } from "@/lib/api/poster-actions";
import { can, requestPermission, type PermissionSubject } from "@/lib/users/permissions";
import { getBlockedTitleKeys } from "@/lib/requests/blocklist";
import { getActiveRequestStatusMap } from "@/lib/requests/query";
import { getArrCredential, isArrFullyConfigured } from "@/lib/integrations/credentials";

const NONE: Record<MediaType, boolean> = { movie: false, tv: false };

/**
 * The rules for one signed-in viewer and one response's worth of titles:
 * a request lookup for those titles, the blocklist (members only — the
 * admin never requests), and whether Radarr/Sonarr are set up (the admin
 * only — members never add; pass `arrConfigured` when the loader already
 * knows). A lookup that fails leaves that action off rather than failing
 * the response.
 */
export async function loadPosterActionRules(
  user: PermissionSubject & { id: string },
  items: readonly { mediaType: MediaType; tmdbId: number }[],
  arrConfigured?: Record<MediaType, boolean>,
): Promise<PosterActionRules> {
  const isAdmin = user.role === "admin";
  const [requestMap, blockedKeys, arr] = await Promise.all([
    items.length > 0
      ? getActiveRequestStatusMap(user.id, [...items]).catch(() => new Map<string, string>())
      : new Map<string, string>(),
    isAdmin ? new Set<string>() : getBlockedTitleKeys().catch(() => new Set<string>()),
    arrConfigured ?? (isAdmin ? loadArrConfigured(user.id) : NONE),
  ]);
  return {
    isAdmin,
    arrConfigured: arr,
    mayRequest: {
      movie: can(user, requestPermission("movie", false)),
      tv: can(user, requestPermission("tv", false)),
    },
    blockedKeys,
    requestedKeys: new Set(requestMap.keys()),
  };
}

/** Whether the default Radarr and Sonarr are fully set up for this owner. */
export async function loadArrConfigured(ownerId: string): Promise<Record<MediaType, boolean>> {
  const [radarr, sonarr] = await Promise.all([
    getArrCredential(ownerId, "radarr").catch(() => null),
    getArrCredential(ownerId, "sonarr").catch(() => null),
  ]);
  return { movie: isArrFullyConfigured(radarr), tv: isArrFullyConfigured(sonarr) };
}
