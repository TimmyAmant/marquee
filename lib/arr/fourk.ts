import type { MediaType } from "@/lib/db/schema";
import type { LibraryStatus } from "@/components/status-badge";
import { deriveRadarrStatus, deriveSonarrStatus } from "@/lib/integrations/arr-status-logic";
import { arrConfig, isServerConfigured, listArrServers, type ArrServer } from "@/lib/arr/servers";
import { kindForMediaType } from "@/lib/arr/add-options";
import { askEachServer, bestByStatus } from "@/lib/arr/fan-out";
import * as radarr from "@/lib/radarr/client";
import * as sonarr from "@/lib/sonarr/client";

export { arrInstanceFor, arrInstanceLabel, arrKindOf, isFourK } from "@/lib/arr/instances";

// The 4K Sonarr and Radarr servers: kept apart from the main library, the
// way Seerr's 4K servers are. A title can be requested "in 4K"; approving
// that adds it to a 4K server instead of a standard one. Unlike the standard
// servers these aren't synced into the library cache — "owned" everywhere
// keeps meaning the main library — and a title page reads the 4K status
// live, from every 4K server of its kind at once (a title may be on more
// than one).

function fourKServers(ownerId: string, mediaType: MediaType): Promise<ArrServer[]> {
  return listArrServers(ownerId, { kind: kindForMediaType(mediaType), fourK: true });
}

/** Whether the default 4K server for this type has a root folder and
 * quality profile — what a 4K request or add needs. */
export async function isFourKReady(adminUserId: string, mediaType: MediaType): Promise<boolean> {
  const [server] = await fourKServers(adminUserId, mediaType);
  return isServerConfigured(server);
}

export type FourKStatus = {
  /** Set up with defaults, so 4K requests and adds can go there. */
  configured: boolean;
  /** How the 4K servers have the title (the furthest along of them);
   * "untracked" when none does. */
  status: LibraryStatus;
};

type FourKCopy = { server: ArrServer; arrId: number; status: LibraryStatus };

/** Every 4K server's copy of the title, asked in parallel within the 2.5s
 * budget; a slow or unreachable server counts as not having it. */
async function findFourKCopies(
  servers: ArrServer[],
  mediaType: MediaType,
  tmdbId: number,
  tvdbId: number | null,
): Promise<FourKCopy[]> {
  if (mediaType === "tv" && !tvdbId) return [];
  const answers = await askEachServer(
    servers,
    async (server): Promise<FourKCopy | null> => {
      if (mediaType === "movie") {
        const movie = await radarr.getMovieByTmdbId(arrConfig(server), tmdbId);
        return movie ? { server, arrId: movie.id, status: deriveRadarrStatus(movie) } : null;
      }
      const series = await sonarr.getSeriesByTvdbId(arrConfig(server), tvdbId!);
      return series ? { server, arrId: series.id, status: deriveSonarrStatus(series) } : null;
    },
    null,
  );
  return answers.map((a) => a.value).filter((c): c is FourKCopy => c !== null);
}

/**
 * The title as the 4K servers have it, asked live (only a title page and
 * the request lists ask). Null when there's no 4K server for this type.
 */
export async function getFourKStatus(
  adminUserId: string,
  mediaType: MediaType,
  tmdbId: number,
  tvdbId: number | null,
): Promise<FourKStatus | null> {
  const servers = await fourKServers(adminUserId, mediaType);
  if (servers.length === 0) return null;
  const configured = isServerConfigured(servers[0]);
  const copies = await findFourKCopies(servers, mediaType, tmdbId, tvdbId);
  const best = bestByStatus(copies, (c) => c.status);
  return { configured, status: best?.status ?? "untracked" };
}

/** Asks every 4K server that has the title to search for it again; null
 * when none has it (or there's no 4K server). */
export async function searchFourK(
  adminUserId: string,
  mediaType: MediaType,
  tmdbId: number,
  tvdbId: number | null,
): Promise<{ ok: true } | { ok: false; code: "upstream"; error: string } | null> {
  const servers = await fourKServers(adminUserId, mediaType);
  if (servers.length === 0) return null;
  const copies = await findFourKCopies(servers, mediaType, tmdbId, tvdbId);
  if (copies.length === 0) return null;
  const results = await Promise.allSettled(
    copies.map((copy) =>
      mediaType === "movie"
        ? radarr.searchMovie(arrConfig(copy.server), copy.arrId)
        : sonarr.searchSeries(arrConfig(copy.server), copy.arrId),
    ),
  );
  const failed = copies.filter((_, i) => results[i].status === "rejected");
  if (failed.length === copies.length) {
    return { ok: false, code: "upstream", error: `Couldn't queue a search on ${failed[0].server.name}.` };
  }
  return { ok: true };
}
