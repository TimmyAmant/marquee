import {
  EMPTY_MEDIA_DETAIL,
  aggregateMediaDetail,
  hasAtmos,
  normalizeAudioCodec,
  normalizeBitrateKbps,
  normalizeChannels,
  normalizeContainer,
  normalizeResolution,
  normalizeVideoCodec,
} from "@/lib/media-info";
import type { MediaDetail } from "@/lib/media-info";

const PLEX_TV_BASE = "https://plex.tv";
const PRODUCT = "Marquee";
// A slow/unreachable Plex server (or plex.tv itself) shouldn't be able to
// hang a page render indefinitely — same reasoning as the arr/Jellyfin
// clients' REQUEST_TIMEOUT_MS.
const REQUEST_TIMEOUT_MS = 8000;

// See LIBRARY_TIMEOUT_MS in lib/radarr/client.ts — a whole section listing
// is a sync's job, not a page render's.
const LIBRARY_TIMEOUT_MS = 120_000;

function plexHeaders(clientId: string, token?: string) {
  return {
    Accept: "application/json",
    "X-Plex-Product": PRODUCT,
    "X-Plex-Client-Identifier": clientId,
    ...(token ? { "X-Plex-Token": token } : {}),
  };
}

export interface PlexPin {
  id: number;
  code: string;
  authToken: string | null;
}

export async function createPin(clientId: string): Promise<PlexPin> {
  const res = await fetch(`${PLEX_TV_BASE}/api/v2/pins?strong=true`, {
    method: "POST",
    headers: plexHeaders(clientId),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Failed to create Plex pin (${res.status})`);
  return res.json();
}

export async function checkPin(clientId: string, pinId: number): Promise<PlexPin> {
  const res = await fetch(`${PLEX_TV_BASE}/api/v2/pins/${pinId}`, {
    headers: plexHeaders(clientId),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Failed to check Plex pin (${res.status})`);
  return res.json();
}

export function buildPlexAuthUrl(clientId: string, code: string): string {
  const params = new URLSearchParams({
    clientID: clientId,
    code,
    "context[device][product]": PRODUCT,
  });
  return `https://app.plex.tv/auth#?${params.toString()}`;
}

export interface PlexConnection {
  uri: string;
  local: boolean;
  relay: boolean;
}

export interface PlexResource {
  name: string;
  clientIdentifier: string;
  provides: string;
  /** False for a server another Plex account has shared with this one. */
  owned?: boolean;
  connections: PlexConnection[];
}

export async function getResources(clientId: string, token: string): Promise<PlexResource[]> {
  const res = await fetch(`${PLEX_TV_BASE}/api/v2/resources?includeHttps=1`, {
    headers: plexHeaders(clientId, token),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Failed to list Plex resources (${res.status})`);
  const resources: PlexResource[] = await res.json();
  // Only the admin's own servers: a friend's shared server isn't the
  // household library, and syncing it would both mark their titles as owned
  // here and hand the admin's account-wide token to a machine someone else
  // runs.
  return resources.filter((r) => r.owned !== false && r.provides.split(",").includes("server"));
}

export function pickBestConnection(connections: PlexConnection[]): string | null {
  const local = connections.find((c) => c.local && !c.relay);
  if (local) return local.uri;
  const direct = connections.find((c) => !c.relay);
  if (direct) return direct.uri;
  return connections[0]?.uri ?? null;
}

export interface PlexLibrarySection {
  key: string;
  type: "movie" | "show" | string;
  title: string;
}

export async function getLibrarySections(
  serverUri: string,
  token: string,
): Promise<PlexLibrarySection[]> {
  const res = await fetch(`${serverUri}/library/sections`, {
    headers: { Accept: "application/json", "X-Plex-Token": token },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Failed to list library sections (${res.status})`);
  const body = await res.json();
  return body.MediaContainer?.Directory ?? [];
}

/** A track inside a Part. Only ever present on an item's *own* metadata
 * (/library/metadata/{ratingKey}) — a section listing stops at Part, which
 * is why dynamic range needs the extra fetch in
 * `getMediaDetailsByRatingKeys` below. */
export interface PlexStream {
  /** 1 = video, 2 = audio, 3 = subtitle. */
  streamType?: number;
  codec?: string;
  channels?: number;
  audioChannelLayout?: string;
  profile?: string;
  title?: string;
  displayTitle?: string;
  extendedDisplayTitle?: string;
  /** Plex's Dolby Vision flags — the only reliable HDR signal it exposes. */
  DOVIPresent?: boolean;
  DOVIProfile?: string | number;
  /** Transfer characteristics: "smpte2084" is PQ (HDR10), "arib-std-b67" HLG. */
  colorTrc?: string;
  colorSpace?: string;
  bitDepth?: number;
  bitrate?: number;
  width?: number;
  height?: number;
}

export interface PlexPart {
  size?: number;
  file?: string;
  container?: string;
  Stream?: PlexStream[];
}

/** Everything Plex reports about one version of an item's file. All of it
 * rides along on the section listing already fetched for size/path — no
 * extra request for resolution, codecs, container or bitrate. */
export interface PlexMedia {
  videoResolution?: string;
  videoCodec?: string;
  videoProfile?: string;
  audioCodec?: string;
  audioProfile?: string;
  audioChannels?: number;
  container?: string;
  /** kbps, unlike Jellyfin's bps. */
  bitrate?: number;
  width?: number;
  height?: number;
  duration?: number;
  Part?: PlexPart[];
}

export interface PlexMetadataItem {
  ratingKey: string;
  type: "movie" | "show" | string;
  title: string;
  addedAt: number;
  Guid?: { id: string }[];
  guid?: string;
  Media?: PlexMedia[];
  // Present directly on the section-listing entry for both movies and shows
  // (a show's is aggregated across its episodes by Plex itself) — no extra
  // per-item request needed, unlike file size for shows.
  viewCount?: number;
  lastViewedAt?: number;
}

export function getFileSize(item: PlexMetadataItem): number | null {
  return item.Media?.[0]?.Part?.[0]?.size ?? null;
}

export function getFilePath(item: PlexMetadataItem): string | null {
  return item.Media?.[0]?.Part?.[0]?.file ?? null;
}

function videoStream(media: PlexMedia | undefined): PlexStream | undefined {
  const streams = media?.Part?.[0]?.Stream ?? [];
  return streams.find((s) => s.streamType === 1);
}

function audioStream(media: PlexMedia | undefined): PlexStream | undefined {
  const streams = media?.Part?.[0]?.Stream ?? [];
  return streams.find((s) => s.streamType === 2);
}

/**
 * Plex has no "dynamic range" field of its own — it has to be read off the
 * video stream, which means this only answers for an item fetched with its
 * streams (see `getMediaDetailsByRatingKeys`). Returns null rather than
 * "SDR" when there's no video stream to look at: not knowing is different
 * from knowing it's SDR, and a wrong "SDR" in the File details card is worse
 * than a missing row.
 */
export function parseDynamicRange(media: PlexMedia | undefined): string | null {
  const stream = videoStream(media);
  if (!stream) return null;

  if (stream.DOVIPresent === true || stream.DOVIProfile !== undefined) return "DV";

  const titles = [stream.extendedDisplayTitle, stream.displayTitle, stream.title]
    .filter((t): t is string => typeof t === "string")
    .join(" ");
  if (/dolby\s*vision|\bdovi\b/i.test(titles)) return "DV";
  if (/hdr10\s*\+|hdr10plus/i.test(titles)) return "HDR10Plus";

  const trc = stream.colorTrc?.toLowerCase() ?? "";
  if (trc.includes("arib-std-b67") || trc.includes("hlg")) return "HLG";
  if (trc.includes("smpte2084") || trc.includes("pq")) return "HDR10";
  if (/\bhdr\b/i.test(titles)) return "HDR10";

  return "SDR";
}

/** Whatever this item's first Media version says about the file. Works on a
 * section-listing entry (everything but dynamic range) and on full metadata
 * (dynamic range too). */
export function parseMediaDetail(item: PlexMetadataItem): MediaDetail {
  const media = item.Media?.[0];
  if (!media) return { ...EMPTY_MEDIA_DETAIL };

  const audio = audioStream(media);
  return {
    resolution: normalizeResolution(media.videoResolution, media.width, media.height),
    videoCodec: normalizeVideoCodec(media.videoCodec),
    dynamicRange: parseDynamicRange(media),
    audioCodec: normalizeAudioCodec(media.audioCodec ?? audio?.codec, {
      profile: audio?.profile ?? media.audioProfile,
      atmos: hasAtmos(
        audio?.profile,
        audio?.title,
        audio?.displayTitle,
        audio?.extendedDisplayTitle,
        media.audioProfile,
      ),
    }),
    audioChannels: normalizeChannels(media.audioChannels ?? audio?.channels),
    container: normalizeContainer(media.container ?? media.Part?.[0]?.container),
    bitrateKbps: normalizeBitrateKbps(media.bitrate, "kbps"),
  };
}

export async function getSectionItems(
  serverUri: string,
  token: string,
  sectionKey: string,
): Promise<PlexMetadataItem[]> {
  const res = await fetch(
    `${serverUri}/library/sections/${sectionKey}/all?includeGuids=1`,
    {
      headers: { Accept: "application/json", "X-Plex-Token": token },
      signal: AbortSignal.timeout(LIBRARY_TIMEOUT_MS),
    },
  );
  if (!res.ok) throw new Error(`Failed to list section items (${res.status})`);
  const body = await res.json();
  return body.MediaContainer?.Metadata ?? [];
}

/** The directory segments every episode file path has in common — the
 * show's own root folder (e.g. season subfolders collapse down to their
 * shared parent), or a single season's folder if that's all that's synced.
 * Path-segment-aware (not a raw string prefix), so "/tv/Show 1/.." and
 * "/tv/Show 10/.." don't get incorrectly credited with a shared "/tv/Show
 * 1" prefix. */
export function commonFolder(filePaths: string[]): string | null {
  if (filePaths.length === 0) return null;
  const dirSegments = filePaths.map((p) => p.slice(0, p.lastIndexOf("/")).split("/"));
  const minLen = Math.min(...dirSegments.map((s) => s.length));
  const common: string[] = [];
  for (let i = 0; i < minLen; i++) {
    const segment = dirSegments[0][i];
    if (!dirSegments.every((segs) => segs[i] === segment)) break;
    common.push(segment);
  }
  const path = common.join("/");
  return path || null;
}

/** A show's own library-section entry has no Media/Part — only individual
 * episodes carry a file — so total size, a location and the media detail all
 * have to be derived from all of a show's episodes via Plex's "all leaves"
 * endpoint. That's the same single request the sync already makes per show,
 * so the detail is free: it's aggregated across episodes (see
 * `aggregateMediaDetail`) rather than taken from any one of them. Dynamic
 * range stays null here — allLeaves is a listing, so it stops at Part and
 * carries no streams. */
export async function getShowFileInfo(
  serverUri: string,
  token: string,
  ratingKey: string,
): Promise<{ sizeBytes: number | null; folderPath: string | null; detail: MediaDetail }> {
  const res = await fetch(`${serverUri}/library/metadata/${ratingKey}/allLeaves`, {
    headers: { Accept: "application/json", "X-Plex-Token": token },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) return { sizeBytes: null, folderPath: null, detail: { ...EMPTY_MEDIA_DETAIL } };
  const body = await res.json();
  const episodes: PlexMetadataItem[] = body.MediaContainer?.Metadata ?? [];
  const total = episodes.reduce((sum, ep) => sum + (getFileSize(ep) ?? 0), 0);
  const episodePaths = episodes.map((ep) => getFilePath(ep)).filter((p): p is string => p !== null);
  return {
    sizeBytes: total > 0 ? total : null,
    folderPath: commonFolder(episodePaths),
    detail: aggregateMediaDetail(episodes.filter((ep) => ep.Media?.length).map(parseMediaDetail)),
  };
}

/** How many rating keys go into one /library/metadata request. Plex accepts a
 * comma-separated list there, so a whole library's streams cost
 * ceil(items / 50) requests instead of one per item. */
const METADATA_BATCH_SIZE = 50;

/** A batch is a bigger response than a single item, and it's a background
 * sync rather than a page render — give it more room than the 8s the
 * interactive calls get. */
const BATCH_TIMEOUT_MS = 20000;

/** Cuts the fetched metadata down to roughly what a section listing would
 * have been, plus the Streams that are the whole reason for the request —
 * without this, a 50-item batch drags along every cast member, genre,
 * chapter and summary. */
const BATCH_QUERY = new URLSearchParams({
  excludeElements: [
    "Director",
    "Writer",
    "Producer",
    "Role",
    "Genre",
    "Country",
    "Collection",
    "Similar",
    "Review",
    "Chapter",
    "Marker",
    "Extras",
    "Label",
    "Rating",
    "Image",
  ].join(","),
  excludeFields: "summary,tagline",
}).toString();

/**
 * Media detail including dynamic range, for items whose own metadata has to
 * be fetched because a section listing stops at Part and never includes
 * Stream. Batched (see METADATA_BATCH_SIZE) and best-effort: a batch that
 * fails or times out is simply left out of the map, and the caller keeps the
 * listing-derived detail it already had.
 */
export async function getMediaDetailsByRatingKeys(
  serverUri: string,
  token: string,
  ratingKeys: string[],
): Promise<Map<string, MediaDetail>> {
  const byRatingKey = new Map<string, MediaDetail>();
  if (ratingKeys.length === 0) return byRatingKey;

  const batches: string[][] = [];
  for (let i = 0; i < ratingKeys.length; i += METADATA_BATCH_SIZE) {
    batches.push(ratingKeys.slice(i, i + METADATA_BATCH_SIZE));
  }

  await Promise.all(
    batches.map(async (batch) => {
      const items = await fetchMetadataBatch(serverUri, token, batch).catch(() => []);
      for (const item of items) {
        if (!item.ratingKey) continue;
        byRatingKey.set(String(item.ratingKey), parseMediaDetail(item));
      }
    }),
  );

  return byRatingKey;
}

async function fetchMetadataBatch(
  serverUri: string,
  token: string,
  ratingKeys: string[],
): Promise<PlexMetadataItem[]> {
  const res = await fetch(
    `${serverUri}/library/metadata/${ratingKeys.join(",")}?${BATCH_QUERY}`,
    {
      headers: { Accept: "application/json", "X-Plex-Token": token },
      signal: AbortSignal.timeout(BATCH_TIMEOUT_MS),
    },
  );
  if (!res.ok) return [];
  const body = await res.json();
  return body.MediaContainer?.Metadata ?? [];
}

export function parseExternalIds(item: PlexMetadataItem): {
  tmdbId: number | null;
  tvdbId: number | null;
  imdbId: string | null;
} {
  const guids = item.Guid?.map((g) => g.id) ?? (item.guid ? [item.guid] : []);
  let tmdbId: number | null = null;
  let tvdbId: number | null = null;
  let imdbId: string | null = null;

  for (const guid of guids) {
    const match = guid.match(/^(tmdb|tvdb|imdb):\/\/(.+)$/);
    if (!match) continue;
    const [, provider, value] = match;
    if (provider === "tmdb") tmdbId = Number(value);
    else if (provider === "tvdb") tvdbId = Number(value);
    else if (provider === "imdb") imdbId = value;
  }

  return { tmdbId, tvdbId, imdbId };
}
