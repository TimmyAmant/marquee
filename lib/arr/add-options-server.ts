import type { MediaType } from "@/lib/db/schema";
import { getOrFetchTitle } from "@/lib/tmdb/cache";
import { isAnime, type AnimeSignals } from "@/lib/arr/anime";
import { kindForMediaType, serverDefaults, type AddDefaults } from "@/lib/arr/add-options";
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

export const SERVER_CANT_TAKE_IT = "That server can't take this request.";

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
    if (!server || server.kind !== kind || server.is4k !== fourK) return fail("invalid", SERVER_CANT_TAKE_IT);
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
  servers: AddOptionsServer[];
};

/** What the Advanced section of Approve / Add offers for this title: every
 * server of its kind and 4K-ness (default first), each asked in parallel
 * for its pickers. */
export async function getAddOptions(
  ownerId: string,
  mediaType: MediaType,
  tmdbId: number,
  fourK: boolean,
): Promise<AddOptions> {
  const [servers, anime] = await Promise.all([
    listArrServers(ownerId, { kind: kindForMediaType(mediaType), fourK }),
    titleIsAnime(mediaType, tmdbId),
  ]);
  const answers = await askEachServer(servers, (server) => fetchPickerOptions(server), null);
  return {
    mediaType,
    tmdbId,
    is4k: fourK,
    isAnime: anime,
    servers: answers.map(({ server, value }) => ({
      id: server.id,
      name: server.name,
      isDefault: server.isDefault,
      is4k: server.is4k,
      reachable: value !== null,
      qualityProfiles: value?.qualityProfiles ?? [],
      rootFolders: value?.rootFolders ?? [],
      tags: value?.tags ?? [],
      defaults: serverDefaults(server, anime),
    })),
  };
}
