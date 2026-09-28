import type { MediaType } from "@/lib/db/schema";
import { kindForMediaType } from "@/lib/arr/add-options";
import { arrConfig, listArrServers } from "@/lib/arr/servers";
import { askEachServer } from "@/lib/arr/fan-out";
import { arrTitleLink, type ArrLink } from "@/lib/arr/links";
import * as radarr from "@/lib/radarr/client";
import * as sonarr from "@/lib/sonarr/client";

/**
 * "Open in Radarr/Sonarr": every server of the title's kind that has it —
 * standard and 4K — asked live and in parallel within the 2.5s budget (a
 * slow or unreachable server just gets no link), in Settings order. The
 * caller decides who may see them (lib/pages/title.ts).
 */
export async function getArrLinks(
  ownerId: string,
  mediaType: MediaType,
  tmdbId: number,
  tvdbId: number | null,
): Promise<ArrLink[]> {
  if (mediaType === "tv" && !tvdbId) return [];
  const kind = kindForMediaType(mediaType);
  const servers = await listArrServers(ownerId, { kind });
  if (servers.length === 0) return [];
  const answers = await askEachServer(
    servers,
    async (server): Promise<ArrLink | null> => {
      if (kind === "radarr") {
        const movie = await radarr.getMovieByTmdbId(arrConfig(server), tmdbId);
        return movie ? arrTitleLink(server, { titleSlug: movie.titleSlug, tmdbId: movie.tmdbId || tmdbId }) : null;
      }
      const series = await sonarr.getSeriesByTvdbId(arrConfig(server), tvdbId!);
      return series ? arrTitleLink(server, { titleSlug: series.titleSlug }) : null;
    },
    null,
  );
  return answers.flatMap(({ value }) => (value ? [value] : []));
}
