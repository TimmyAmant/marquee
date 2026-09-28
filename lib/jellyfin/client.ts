import {
  EMPTY_MEDIA_DETAIL,
  hasAtmos,
  normalizeAudioCodec,
  normalizeBitrateKbps,
  normalizeChannels,
  normalizeContainer,
  normalizeDynamicRange,
  normalizeResolution,
  normalizeVideoCodec,
} from "@/lib/media-info";
import type { MediaDetail } from "@/lib/media-info";

export type JellyfinConfig = { baseUrl: string; apiKey: string };

// See the matching constant in lib/radarr/client.ts — a slow/unreachable
// Jellyfin instance shouldn't be able to hang a page render indefinitely.
const REQUEST_TIMEOUT_MS = 8000;

// See LIBRARY_TIMEOUT_MS in lib/radarr/client.ts.
const LIBRARY_TIMEOUT_MS = 120_000;

/** An API key or access token, in both the header Jellyfin 10.x reads
 * (`X-Emby-Token`) and the one current servers require: Jellyfin 12 no
 * longer accepts the legacy X-Emby-* headers on their own (401), while
 * `Authorization: MediaBrowser Token="…"` works on 10.8 onwards. */
export function jellyfinTokenHeaders(token: string): Record<string, string> {
  return { "X-Emby-Token": token, Authorization: `MediaBrowser Token="${token.replace(/["\\,\r\n]/g, "")}"` };
}

async function jellyfinFetch<T>(
  config: JellyfinConfig,
  path: string,
  timeoutMs: number = REQUEST_TIMEOUT_MS,
): Promise<T> {
  const url = new URL(`${config.baseUrl.replace(/\/$/, "")}${path}`);
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      ...jellyfinTokenHeaders(config.apiKey),
    },
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    throw new Error(`Jellyfin request failed: ${path} (${res.status})`);
  }

  return res.json() as Promise<T>;
}

export interface JellyfinSystemInfo {
  Id: string;
  ServerName: string;
  Version: string;
  /** "Jellyfin Server" on Jellyfin; Emby doesn't send it. */
  ProductName?: string;
}

export function testConnection(config: JellyfinConfig): Promise<JellyfinSystemInfo> {
  return jellyfinFetch<JellyfinSystemInfo>(config, "/System/Info");
}

/** One track of a MediaSource. Jellyfin nests these inside MediaSources, so
 * the `MediaSources` field the sync already asks for brings them along at no
 * extra cost — unlike Plex, where streams need a second request. */
export interface JellyfinMediaStream {
  Type?: "Video" | "Audio" | "Subtitle" | string;
  Codec?: string;
  Profile?: string;
  Width?: number;
  Height?: number;
  Channels?: number;
  ChannelLayout?: string;
  BitRate?: number;
  /** "SDR" | "HDR" — the coarse one. */
  VideoRange?: string;
  /** "SDR" | "HDR10" | "HDR10Plus" | "HLG" | "DOVI" | "DOVIWithHDR10" | … */
  VideoRangeType?: string;
  Title?: string;
  DisplayTitle?: string;
}

export interface JellyfinMediaSource {
  Size?: number;
  Container?: string;
  /** bps, unlike Plex's kbps. */
  Bitrate?: number;
  MediaStreams?: JellyfinMediaStream[];
}

export interface JellyfinItem {
  Id: string;
  Name: string;
  Type: "Movie" | "Series" | string;
  DateCreated?: string;
  Path?: string;
  ProviderIds?: {
    Tmdb?: string;
    Tvdb?: string;
    Imdb?: string;
  };
  MediaSources?: JellyfinMediaSource[];
}

/** One call gets every movie and show in the server's library, each already
 * carrying TMDb/TVDB/IMDb ids directly on ProviderIds — Jellyfin's metadata
 * plugins populate these natively, no guid-string parsing needed (unlike
 * Plex's `parseExternalIds`). Movies carry a file size via MediaSources;
 * shows don't (Jellyfin reports that per-episode, not on the series
 * entry) — scoped out for v1, same as the "known gap" noted for Plex shows
 * needing a second request per title. */
export async function getLibraryItems(config: JellyfinConfig): Promise<JellyfinItem[]> {
  const params = new URLSearchParams({
    Recursive: "true",
    IncludeItemTypes: "Movie,Series",
    Fields: "ProviderIds,MediaSources,DateCreated,Path",
  });
  const body = await jellyfinFetch<{ Items: JellyfinItem[] }>(
    config,
    `/Items?${params.toString()}`,
    LIBRARY_TIMEOUT_MS,
  );
  return body.Items ?? [];
}

export interface JellyfinEpisodeItem {
  SeriesId?: string;
  ParentIndexNumber?: number;
  LocationType?: string;
}

/** Episodes with a file on disk per series id, specials (season 0) left
 * out — a series poster's "have" (lib/library/episode-counts.ts). One
 * listing of every episode, trimmed to the few fields it needs; a missing
 * episode Jellyfin only knows from metadata ("Virtual") doesn't count. */
export async function getEpisodeFileCountsBySeries(config: JellyfinConfig): Promise<Map<string, number>> {
  const params = new URLSearchParams({
    Recursive: "true",
    IncludeItemTypes: "Episode",
    IsMissing: "false",
    Fields: "",
    EnableImages: "false",
    EnableUserData: "false",
  });
  const body = await jellyfinFetch<{ Items: JellyfinEpisodeItem[] }>(
    config,
    `/Items?${params.toString()}`,
    LIBRARY_TIMEOUT_MS,
  );
  return countEpisodeFilesBySeries(body.Items ?? []);
}

export function countEpisodeFilesBySeries(items: readonly JellyfinEpisodeItem[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (!item.SeriesId || item.LocationType === "Virtual" || item.ParentIndexNumber === 0) continue;
    counts.set(item.SeriesId, (counts.get(item.SeriesId) ?? 0) + 1);
  }
  return counts;
}

export function getFileSize(item: JellyfinItem): number | null {
  return item.MediaSources?.[0]?.Size ?? null;
}

/**
 * Everything Jellyfin reports about this item's file, from the first
 * MediaSource and its streams. Movies only in practice: a Series item has no
 * MediaSources at all (Jellyfin keeps those on episodes), the same gap that
 * already leaves TV without a size — see syncJellyfinLibrary.
 */
export function parseMediaDetail(item: JellyfinItem): MediaDetail {
  const source = item.MediaSources?.[0];
  if (!source) return { ...EMPTY_MEDIA_DETAIL };

  const streams = source.MediaStreams ?? [];
  const video = streams.find((s) => s.Type === "Video");
  const audio = streams.find((s) => s.Type === "Audio");

  return {
    resolution: normalizeResolution(null, video?.Width, video?.Height),
    videoCodec: normalizeVideoCodec(video?.Codec),
    // VideoRangeType is the precise one ("HDR10Plus", "DOVIWithHDR10");
    // VideoRange only distinguishes HDR from SDR, so it's the fallback for
    // older servers that don't report the former.
    dynamicRange: normalizeDynamicRange(video?.VideoRangeType ?? video?.VideoRange),
    audioCodec: normalizeAudioCodec(audio?.Codec, {
      profile: audio?.Profile,
      atmos: hasAtmos(audio?.Profile, audio?.Title, audio?.DisplayTitle),
    }),
    audioChannels: normalizeChannels(audio?.Channels),
    container: normalizeContainer(source.Container),
    bitrateKbps: normalizeBitrateKbps(source.Bitrate ?? video?.BitRate, "bps"),
  };
}

export function parseExternalIds(item: JellyfinItem): {
  tmdbId: number | null;
  tvdbId: number | null;
  imdbId: string | null;
} {
  const ids = item.ProviderIds ?? {};
  return {
    tmdbId: ids.Tmdb ? Number(ids.Tmdb) : null,
    tvdbId: ids.Tvdb ? Number(ids.Tvdb) : null,
    imdbId: ids.Imdb ?? null,
  };
}
