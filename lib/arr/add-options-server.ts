import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { requests, type MediaType } from "@/lib/db/schema";
import { can, type PermissionSubject } from "@/lib/users/permissions";
import { UUID_PATTERN } from "@/lib/arr/servers";
import { getT } from "@/lib/i18n/server";
import { getOrFetchTitle } from "@/lib/tmdb/cache";
import { isAnime, type AnimeSignals } from "@/lib/arr/anime";
import { kindForMediaType, resolveAdd, serverDefaults, type AddDefaults } from "@/lib/arr/add-options";
import { ruleForRequest } from "@/lib/arr/override-rules-server";
import { arrConfig, getArrServer, listArrServers, type ArrServer } from "@/lib/arr/servers";
import { askEachServer } from "@/lib/arr/fan-out";
import * as sonarr from "@/lib/sonarr/client";
import * as radarr from "@/lib/radarr/client";
import { fail, type CoreResult } from "@/lib/core-result";

// The database/network half of lib/arr/add-options.ts: which server a title
// goes to, whether it's anime, and what the Advanced pickers offer.

/** Whether TMDb says the title is anime (lib/arr/anime.ts). A title TMDb
 * can't be asked about right now counts as not anime. */
export async function titleIsAnime(mediaType: MediaType, tmdbId: number): Promise<boolean> {
  if (mediaType !== "tv") return false;
  const title = await getOrFetchTitle(mediaType, tmdbId).catch(() => null);
  return isAnime((title?.rawTmdb ?? null) as AnimeSignals | null);
}


/** The server a title of this type goes to: the one picked (which must be
 * of the right kind and 4K-ness), or the default. Null when there's none. */
export async function pickServer(
  ownerId: string,
  mediaType: MediaType,
  fourK: boolean,
  serverId: string | undefined,
): Promise<CoreResult<{ server: ArrServer | null }>> {
  const kind = kindForMediaType(mediaType);
  if (serverId) {
    const server = await getArrServer(ownerId, serverId);
    if (!server || server.kind !== kind || server.is4k !== fourK) return fail("invalid", (await getT())("notify.serverCantTakeIt"));
    return { ok: true, server };
  }
  const [server] = await listArrServers(ownerId, { kind, fourK });
  return { ok: true, server: server ?? null };
}

export type ArrPickerOptions = {
  qualityProfiles: { id: number; name: string }[];
  rootFolders: { id: number; path: string }[];
  tags: { id: number; label: string }[];
};

/** A server's quality profiles, root folders and tags, straight from it. */
export async function fetchPickerOptions(server: Pick<ArrServer, "kind" | "baseUrl" | "apiKey">): Promise<ArrPickerOptions> {
  const client = server.kind === "sonarr" ? sonarr : radarr;
  const config = arrConfig(server);
  const [qualityProfiles, rootFolders, tags] = await Promise.all([
    client.getQualityProfiles(config),
    client.getRootFolders(config),
    client.getTags(config),
  ]);
  return {
    qualityProfiles: qualityProfiles.map((p) => ({ id: p.id, name: p.name })),
    rootFolders: rootFolders.map((f) => ({ id: f.id, path: f.path })),
    tags: tags.map((t) => ({ id: t.id, label: t.label })),
  };
}

export type AddOptionsServer = ArrPickerOptions & {
  id: string;
  name: string;
  isDefault: boolean;
  is4k: boolean;
  /** Answered within the 2.5s budget; if not, the lists are empty. */
  reachable: boolean;
  defaults: AddDefaults;
};

export type AddOptions = {
  mediaType: MediaType;
  tmdbId: number;
  is4k: boolean;
  isAnime: boolean;
  /** The override rule (Settings › Services) a request would go by: its
   * server comes first in `servers`, with the rule's picks as its
   * defaults. Null when none applies, or for the admin's own Add. */
  rule: { id: string; name: string; serverId: string } | null;
  servers: AddOptionsServer[];
};

/** Whose request the Advanced options are for: the one being reviewed
 * (`requestId`, for someone who may review requests), or the viewer's own
 * (`forRequest`). Undefined for the admin's own Add, where no override rule
 * applies. */
export async function requesterForOptions(
  viewer: PermissionSubject & { id: string },
  context: { requestId?: string | null; forRequest?: boolean } | undefined,
): Promise<{ requesterId: string | null } | undefined> {
  if (context?.requestId) {
    if (!UUID_PATTERN.test(context.requestId) || !can(viewer, "reviewRequests")) return undefined;
    const [row] = await db
      .select({ requesterId: requests.requestedByUserId })
      .from(requests)
      .where(eq(requests.id, context.requestId))
      .limit(1);
    return row ? { requesterId: row.requesterId } : undefined;
  }
  return context?.forRequest ? { requesterId: viewer.id } : undefined;
}

/** What the Advanced section of Approve / Add offers for this title: every
 * server of its kind and 4K-ness (default first), each asked in parallel
 * for its pickers. With `forRequest` (whose request it is), the override
 * rule that applies puts its server first, with its picks. */
export async function getAddOptions(
  ownerId: string,
  mediaType: MediaType,
  tmdbId: number,
  fourK: boolean,
  forRequest?: { requesterId: string | null },
): Promise<AddOptions> {
  const [servers, anime, applied] = await Promise.all([
    listArrServers(ownerId, { kind: kindForMediaType(mediaType), fourK }),
    titleIsAnime(mediaType, tmdbId),
    forRequest
      ? ruleForRequest(ownerId, { mediaType, tmdbId, is4k: fourK, requesterId: forRequest.requesterId })
      : Promise.resolve(null),
  ]);
  const answers = await askEachServer(servers, (server) => fetchPickerOptions(server), null);
  const options: AddOptionsServer[] = answers.map(({ server, value }) => ({
    id: server.id,
    name: server.name,
    isDefault: server.isDefault,
    is4k: server.is4k,
    reachable: value !== null,
    qualityProfiles: value?.qualityProfiles ?? [],
    rootFolders: value?.rootFolders ?? [],
    tags: value?.tags ?? [],
    defaults:
      applied && applied.rule.serverId === server.id
        ? resolveAdd(server, anime, applied.overrides)
        : serverDefaults(server, anime),
  }));
  const ruleServer = applied ? options.find((s) => s.id === applied.rule.serverId) : undefined;
  return {
    mediaType,
    tmdbId,
    is4k: fourK,
    isAnime: anime,
    rule: applied && ruleServer ? { id: applied.rule.id, name: applied.rule.name, serverId: ruleServer.id } : null,
    servers: ruleServer ? [ruleServer, ...options.filter((s) => s !== ruleServer)] : options,
  };
}
