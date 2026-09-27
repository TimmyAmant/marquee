// Which quick action a poster card offers — the one rule behind every
// /api/v1 list that returns TitleCards (Discover's shelves, See all, the
// Movies/Series grids, Because you watched, search, a person's credits, a
// studio's catalog, a title's franchise and similar rows). It's the
// website's rule (components/franchise-row.tsx, similar-titles-row.tsx,
// app/discover/fetch-items.ts): the admin gets "+ Add" when Radarr/Sonarr
// is set up for that type and the title isn't in the library; a member with
// the request permission for that type gets "Request", unless the title is
// on the blocklist or they've already asked for it, which reads "Requested".
//
// Pure, like lib/api/mappers.ts — the lookups live in
// lib/api/poster-action-rules.ts.
import type { TitleCard } from "@/lib/api/types";
import type { LibraryStatus } from "@/components/status-badge";
import type { MediaType } from "@/lib/db/schema";
import { isUnwanted } from "@/lib/library/status-tone";

export type PosterActions = Pick<TitleCard, "canQuickAdd" | "canRequest" | "requested">;

/** Everything posterActions() needs, gathered once per response. */
export type PosterActionRules = {
  isAdmin: boolean;
  /** Radarr (movie) / Sonarr (tv) fully set up, quality profile and root folder included. */
  arrConfigured: Record<MediaType, boolean>;
  /** The viewer's requestMovies / requestTv switches (lib/users/permissions.ts). */
  mayRequest: Record<MediaType, boolean>;
  /** Blocked single titles, "movie:603" (lib/requests/blocklist.ts). */
  blockedKeys: ReadonlySet<string>;
  /** Titles this viewer has a pending or approved request for, "movie:603". */
  requestedKeys: ReadonlySet<string>;
};

/** The quick action a card offers this viewer. Pure; unit tested. */
export function posterActions(
  rules: PosterActionRules,
  mediaType: MediaType,
  tmdbId: number,
  status: LibraryStatus | null | undefined,
): PosterActions {
  const key = `${mediaType}:${tmdbId}`;
  const requested = rules.requestedKeys.has(key);
  const wanted = isUnwanted(status);
  const canQuickAdd = wanted && rules.isAdmin && rules.arrConfigured[mediaType];
  const canRequest =
    wanted && !rules.isAdmin && rules.mayRequest[mediaType] && !rules.blockedKeys.has(key) && !requested;
  return { canQuickAdd, canRequest, requested };
}
