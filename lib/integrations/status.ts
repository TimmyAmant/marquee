import * as sonarr from "@/lib/sonarr/client";
import * as radarr from "@/lib/radarr/client";
import { getPlexFileInfo } from "@/lib/plex/sync";
import { getJellyfinFileInfo } from "@/lib/jellyfin/sync";
import { deriveRadarrStatus, deriveSonarrStatus } from "@/lib/integrations/arr-status-logic";
import type { LibraryStatus } from "@/components/status-badge";
import type { MediaDetail } from "@/lib/media-info";
import { isSeasonComplete, type SeasonLibraryState } from "@/lib/requests/seasons";
import { arrConfig, isServerConfigured, listLibraryServers, type ArrServer } from "@/lib/arr/servers";
import { askEachServer, bestByStatus } from "@/lib/arr/fan-out";
import { mergeSeasonStates } from "@/lib/arr/merge";

export type FileInfo = {
  /** For Plex-owned TV, this is the folder every episode's file has in
   * common (derived at sync time from per-episode paths, since Plex only
   * reports Media/Part on individual episodes, not the show itself) —
   * falls back to Sonarr's series path if that derivation ever comes back
   * null. Always present when `file` itself is non-null (set for "owned" items,
   * and for a show Sonarr has some episodes of; never for missing or
   * monitored ones). */
  path: string | null;
  sizeBytes: number;
  quality?: string;
  /** From Radarr's `mediaInfo` when it has the movie (free off the same
   * `/movie?tmdbId=X` call already made for `quality` above), otherwise from
   * whatever Plex or Jellyfin recorded for the file at sync time. Sonarr has
   * no per-series file mediaInfo without a per-episode expansion, so for TV
   * these only ever come from a media server — Plex aggregated across the
   * show's episodes, and nothing at all from Jellyfin, which keeps media
   * info on episodes rather than the series. */
  resolution?: string;
  videoCodec?: string;
  dynamicRange?: string;
  audioCodec?: string;
  audioChannels?: number;
  /** Media-server-only: neither *arr reports a container or an overall
   * bitrate for the file it fetched. */
  container?: string;
  bitrateKbps?: number;
  dateAdded?: string;
  releaseGroup?: string;
  edition?: string;
};

export type TitleLibraryStatus = {
  status: LibraryStatus;
  provider: "plex" | "jellyfin" | "sonarr" | "radarr" | null;
  configured: boolean;
  file: FileInfo | null;
};

/** The movie as every standard Radarr has it — asked of all of them in
 * parallel within the 2.5s budget — shared by the ownership check below and
 * by the media-server branches of `getTitleLibraryStatus` (a movie Plex owns
 * is usually tracked in Radarr too, and Radarr is the authority on the file
 * it fetched). `movie` is the furthest-along copy, the default server
 * winning a tie. */
type RadarrLookup = {
  configured: boolean;
  connected: boolean;
  movie: radarr.RadarrMovie | null;
  /** Every server's copy, for acting on all of them. */
  copies: { server: ArrServer; movie: radarr.RadarrMovie }[];
};

async function lookUpRadarrMovie(userId: string, tmdbId: number): Promise<RadarrLookup> {
  const servers = await listLibraryServers(userId, "radarr");
  if (servers.length === 0) return { configured: false, connected: false, movie: null, copies: [] };
  const answers = await askEachServer(servers, (server) => radarr.getMovieByTmdbId(arrConfig(server), tmdbId), null);
  const copies = answers.flatMap(({ server, value }) => (value ? [{ server, movie: value }] : []));
  const best = bestByStatus(copies, (c) => deriveRadarrStatus(c.movie));
  return { configured: isServerConfigured(servers[0]), connected: true, movie: best?.movie ?? null, copies };
}

/** The same for a show across every standard Sonarr, each server's quality
 * profiles fetched alongside (for the File details card) rather than after. */
type SonarrLookup = {
  configured: boolean;
  connected: boolean;
  best: SonarrCopy | null;
  copies: SonarrCopy[];
};

type SonarrCopy = { server: ArrServer; series: sonarr.SonarrSeries; profiles: sonarr.SonarrQualityProfile[] };

async function lookUpSonarrSeries(userId: string, tvdbId: number | null): Promise<SonarrLookup> {
  const servers = await listLibraryServers(userId, "sonarr");
  if (servers.length === 0) return { configured: false, connected: false, best: null, copies: [] };
  const configured = isServerConfigured(servers[0]);
  if (!tvdbId) return { configured, connected: true, best: null, copies: [] };
  const answers = await askEachServer(
    servers,
    async (server): Promise<SonarrCopy | null> => {
      const config = arrConfig(server);
      // Independent of each other: a small unused profile list costs far
      // less than a second round-trip once the series turns out to exist.
      const [series, profiles] = await Promise.all([
        sonarr.getSeriesByTvdbId(config, tvdbId),
        sonarr.getQualityProfiles(config).catch(() => []),
      ]);
      return series ? { server, series, profiles } : null;
    },
    null,
  );
  const copies = answers.flatMap(({ value }) => (value ? [value] : []));
  return { configured, connected: true, best: bestByStatus(copies, (c) => deriveSonarrStatus(c.series)), copies };
}

async function getArrStatus(
  userId: string,
  mediaType: "movie" | "tv",
  tmdbId: number,
  tvdbId: number | null,
  radarrLookup: RadarrLookup | null,
  sonarrLookup: SonarrLookup | null,
): Promise<TitleLibraryStatus> {
  if (mediaType === "movie") {
    const lookup = radarrLookup ?? (await lookUpRadarrMovie(userId, tmdbId));
    if (!lookup.connected) return { status: "untracked", provider: "radarr", configured: false, file: null };

    const { movie, configured } = lookup;
    if (!movie) return { status: "untracked", provider: "radarr", configured, file: null };

    const status = deriveRadarrStatus(movie);
    const extras = radarrFileExtras(movie);
    const file: FileInfo | null =
      status === "owned" && movie.movieFile
        ? {
            path: movie.movieFile.path,
            sizeBytes: movie.movieFile.size,
            quality: extras?.quality ?? undefined,
            resolution: extras?.resolution,
            videoCodec: extras?.videoCodec,
            dynamicRange: extras?.dynamicRange,
            audioCodec: extras?.audioCodec,
            audioChannels: extras?.audioChannels,
            dateAdded: movie.movieFile.dateAdded,
            releaseGroup: extras?.releaseGroup,
            edition: extras?.edition,
          }
        : null;

    return { status, provider: "radarr", configured, file };
  }

  const lookup = sonarrLookup ?? (await lookUpSonarrSeries(userId, tvdbId));
  if (!lookup.connected) return { status: "untracked", provider: "sonarr", configured: false, file: null };
  const { configured } = lookup;
  const series = lookup.best?.series ?? null;
  if (!series) return { status: "untracked", provider: "sonarr", configured, file: null };

  const status = deriveSonarrStatus(series);
  // A show with some episodes on disk ("tracked_downloading") gets its
  // folder and size too: the badge beside it already says it's still
  // coming, and where the episodes that are here live is exactly what the
  // card is for.
  const file: FileInfo | null =
    (status === "owned" || status === "tracked_downloading") && series.statistics?.sizeOnDisk
      ? { path: series.path ?? null, sizeBytes: series.statistics.sizeOnDisk }
      : null;

  return { status, provider: "sonarr", configured, file };
}

/** The parts of a Radarr movie file that describe the file rather than
 * locate it — reused for a Plex/Jellyfin-owned movie that Radarr also
 * tracks, where Radarr is the better source for all of it. */
type ArrFileExtras = {
  path: string | null;
  quality: string | null;
  resolution?: string;
  videoCodec?: string;
  dynamicRange?: string;
  audioCodec?: string;
  audioChannels?: number;
  releaseGroup?: string;
  edition?: string;
};

function radarrFileExtras(movie: radarr.RadarrMovie | null): ArrFileExtras | null {
  const movieFile = movie?.movieFile;
  if (!movieFile) return null;
  return {
    path: movieFile.path ?? null,
    quality: movieFile.quality?.quality?.name ?? null,
    resolution: movieFile.mediaInfo?.resolution,
    videoCodec: movieFile.mediaInfo?.videoCodec,
    // Radarr leaves this empty (not absent) for plain SDR.
    dynamicRange: movieFile.mediaInfo?.videoDynamicRangeType || undefined,
    audioCodec: movieFile.mediaInfo?.audioCodec,
    audioChannels: movieFile.mediaInfo?.audioChannels,
    releaseGroup: movieFile.releaseGroup,
    edition: movieFile.edition || undefined,
  };
}

/** What a Plex/Jellyfin-owned title's File details card is built from: the
 * media server's own record of the file, with anything the matching *arr
 * knows taking precedence — it's authoritative about the release it fetched,
 * and it's the only one of the two that has a quality profile, a release
 * group or an edition at all. Container and bitrate only ever come from the
 * media server, which is the only side that reports them. */
function mediaServerFile(
  mediaServer: { path: string | null; sizeBytes: number | null; addedAt: Date | null } & MediaDetail,
  arr: ArrFileExtras | null,
): FileInfo {
  return {
    path: mediaServer.path ?? arr?.path ?? null,
    sizeBytes: mediaServer.sizeBytes ?? 0,
    quality: arr?.quality ?? undefined,
    resolution: arr?.resolution ?? mediaServer.resolution ?? undefined,
    videoCodec: arr?.videoCodec ?? mediaServer.videoCodec ?? undefined,
    dynamicRange: arr?.dynamicRange ?? mediaServer.dynamicRange ?? undefined,
    audioCodec: arr?.audioCodec ?? mediaServer.audioCodec ?? undefined,
    audioChannels: arr?.audioChannels ?? mediaServer.audioChannels ?? undefined,
    container: mediaServer.container ?? undefined,
    bitrateKbps: mediaServer.bitrateKbps ?? undefined,
    dateAdded: mediaServer.addedAt?.toISOString(),
    releaseGroup: arr?.releaseGroup,
    edition: arr?.edition,
  };
}

/**
 * A media-server-owned TV show (Plex/Jellyfin) often has no folder path or
 * quality info of its own — Plex only reports Media/Part per-episode, and
 * Jellyfin doesn't carry a resolved quality profile at all. Most households
 * running Sonarr have that same show tracked there too, so fall back to
 * Sonarr's series path + quality profile name to fill the gap rather than
 * leaving the File details section nearly empty for TV.
 */
function sonarrFileExtras(lookup: SonarrLookup | null): ArrFileExtras | null {
  const copy = lookup?.best;
  if (!copy) return null;
  const quality = copy.series.qualityProfileId
    ? (copy.profiles.find((p) => p.id === copy.series.qualityProfileId)?.name ?? null)
    : null;
  return { path: copy.series.path ?? null, quality };
}

export async function getTitleLibraryStatus(
  userId: string,
  mediaType: "movie" | "tv",
  tmdbId: number,
  tvdbId: number | null,
): Promise<TitleLibraryStatus> {
  // Plex/Jellyfin lookups are cheap local DB reads, not live API calls, so
  // firing all three up front (the *arr extras too) costs one extra DB query
  // in the common case but saves a full sequential round-trip to Sonarr/
  // Radarr — previously only fetched after Plex/Jellyfin ownership was
  // already confirmed, one after the other. The Radarr lookup is the same
  // one `getArrStatus` needs below, so it's handed down rather than repeated.
  const [plexFile, jellyfinFile, sonarrLookup, radarrLookup] = await Promise.all([
    getPlexFileInfo(userId, mediaType, tmdbId, tvdbId).catch(() => null),
    getJellyfinFileInfo(userId, mediaType, tmdbId, tvdbId).catch(() => null),
    mediaType === "tv" ? lookUpSonarrSeries(userId, tvdbId).catch(() => null) : Promise.resolve(null),
    mediaType === "movie"
      ? lookUpRadarrMovie(userId, tmdbId).catch(() => null)
      : Promise.resolve(null),
  ]);
  const sonarrExtra = sonarrFileExtras(sonarrLookup);

  const arrExtra = mediaType === "tv" ? sonarrExtra : radarrFileExtras(radarrLookup?.movie ?? null);

  if (plexFile) {
    return {
      status: "owned",
      provider: "plex",
      configured: true,
      file: mediaServerFile(plexFile, arrExtra),
    };
  }

  if (jellyfinFile) {
    return {
      status: "owned",
      provider: "jellyfin",
      configured: true,
      file: mediaServerFile(jellyfinFile, arrExtra),
    };
  }

  const arrStatus = await getArrStatus(userId, mediaType, tmdbId, tvdbId, radarrLookup, sonarrLookup);
  // Sonarr's quality profile, already fetched above, for a show only Sonarr has.
  if (mediaType === "tv" && arrStatus.file && sonarrExtra?.quality && !arrStatus.file.quality) {
    return { ...arrStatus, file: { ...arrStatus.file, quality: sonarrExtra.quality } };
  }
  return arrStatus;
}

export type SeasonCompleteness = { seasonNumber: number; have: number; total: number };

/**
 * Per-season file-count completeness from Sonarr, for the have/total badge
 * on each row of the season accordion. Covers every season in one call (no
 * per-episode data) — cheap enough to fetch eagerly on page load. Returns
 * null when Sonarr isn't connected or isn't tracking this show — Plex only
 * tells us "owned" at the whole-show level, not per-season, so this is
 * Sonarr-only.
 */
export async function getSonarrSeasonCompleteness(
  userId: string,
  tvdbId: number | null,
): Promise<SeasonCompleteness[] | null> {
  const states = await getSonarrSeasonStates(userId, tvdbId);
  return states ? seasonCompletenessOf(states) : null;
}

/** The accordion's have/total badges from getSonarrSeasonStates, for a
 * caller that already has those and shouldn't ask Sonarr twice. Specials
 * are left out unless they're all the show has. */
export function seasonCompletenessOf(states: SonarrSeasonState[]): SeasonCompleteness[] {
  return states
    .filter((s) => s.seasonNumber > 0 || states.length === 1)
    .map((s) => ({ seasonNumber: s.seasonNumber, have: s.have, total: s.total }));
}

export type SonarrSeasonState = SeasonCompleteness & SeasonLibraryState;

/**
 * Every season of a show as the library owner's Sonarr has it — the
 * completeness counts plus whether Sonarr will fetch it (the season and the
 * series both monitored), specials included. What season requests are
 * judged against. Null when Sonarr isn't connected or isn't tracking the
 * show (or can't be reached).
 */
export async function getSonarrSeasonStates(
  userId: string,
  tvdbId: number | null,
): Promise<SonarrSeasonState[] | null> {
  if (!tvdbId) return null;

  // A show on more than one server: each season as the server that's
  // furthest along with it has it (lib/arr/merge.ts).
  const lookup = await lookUpSonarrSeries(userId, tvdbId);
  if (lookup.copies.length === 0) return null;
  return mergeSeasonStates(lookup.copies.map((c) => sonarrSeasonStates(c.series)));
}

function sonarrSeasonStates(series: sonarr.SonarrSeries): SonarrSeasonState[] {
  return (series.seasons ?? []).map((s) => {
    const have = s.statistics?.episodeFileCount ?? 0;
    const total = s.statistics?.episodeCount ?? 0;
    return {
      seasonNumber: s.seasonNumber,
      have,
      total,
      monitored: series.monitored && s.monitored,
      complete: isSeasonComplete({
        monitored: s.monitored,
        episodeFileCount: have,
        episodeCount: total,
        totalEpisodeCount: s.statistics?.totalEpisodeCount,
      }),
    };
  });
}

/**
 * Per-episode file presence from Sonarr for a single season — fetched lazily
 * only when that season's row is expanded in the accordion, since a show
 * with dozens of seasons shouldn't pull every season's episode list upfront.
 */
export async function getSonarrEpisodeHasFileMap(
  userId: string,
  tvdbId: number | null,
  seasonNumber: number,
): Promise<Map<number, boolean>> {
  const episodeHasFile = new Map<number, boolean>();
  if (!tvdbId) return episodeHasFile;

  const lookup = await lookUpSonarrSeries(userId, tvdbId);
  // On any server counts as had.
  const answers = await askEachServer(
    lookup.copies,
    (copy) => sonarr.getEpisodesBySeriesId(arrConfig(copy.server), copy.series.id, seasonNumber),
    [] as sonarr.SonarrEpisode[],
  );
  for (const { value: episodes } of answers) {
    for (const episode of episodes) {
      episodeHasFile.set(episode.episodeNumber, episodeHasFile.get(episode.episodeNumber) || episode.hasFile);
    }
  }
  return episodeHasFile;
}

export type ArrTrackingInfo = { arrId: number; monitored: boolean };

/** A title's entry on one standard Sonarr/Radarr server. */
export type LibraryCopy = { server: ArrServer; arrId: number; monitored: boolean };

/** Every standard server's entry for this title — a title may be on more
 * than one, and Search now / monitoring act on all of them. Best first. */
export async function findLibraryCopies(
  userId: string,
  mediaType: "movie" | "tv",
  tmdbId: number,
  tvdbId: number | null,
): Promise<LibraryCopy[]> {
  if (mediaType === "movie") {
    const lookup = await lookUpRadarrMovie(userId, tmdbId);
    const best = lookup.copies.find((c) => c.movie === lookup.movie);
    const ordered = best ? [best, ...lookup.copies.filter((c) => c !== best)] : lookup.copies;
    return ordered.map((c) => ({ server: c.server, arrId: c.movie.id, monitored: c.movie.monitored }));
  }
  const lookup = await lookUpSonarrSeries(userId, tvdbId);
  const best = lookup.best;
  const ordered = best ? [best, ...lookup.copies.filter((c) => c !== best)] : lookup.copies;
  return ordered.map((c) => ({ server: c.server, arrId: c.series.id, monitored: c.series.monitored }));
}

/**
 * Whether this title has an entry in Radarr/Sonarr at all, independent of
 * `getTitleLibraryStatus`'s provider — a title can be "owned" via Plex/
 * Jellyfin while still being separately tracked (and searchable/
 * monitorable) in Radarr/Sonarr, the common setup for most households, so
 * this can't just reuse the provider already resolved there. With the
 * title on several servers: the best copy's id, and monitored if any is.
 */
export async function getArrTrackingInfo(
  userId: string,
  mediaType: "movie" | "tv",
  tmdbId: number,
  tvdbId: number | null,
): Promise<ArrTrackingInfo | null> {
  if (mediaType === "tv" && !tvdbId) return null;
  const copies = await findLibraryCopies(userId, mediaType, tmdbId, tvdbId);
  if (copies.length === 0) return null;
  return { arrId: copies[0].arrId, monitored: copies.some((c) => c.monitored) };
}
