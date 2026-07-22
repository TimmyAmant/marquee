const PLEX_TV_BASE = "https://plex.tv";
const PRODUCT = "Marquee";
// A slow/unreachable Plex server (or plex.tv itself) shouldn't be able to
// hang a page render indefinitely — same reasoning as the arr/Jellyfin
// clients' REQUEST_TIMEOUT_MS.
const REQUEST_TIMEOUT_MS = 8000;

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
  connections: PlexConnection[];
}

export async function getResources(clientId: string, token: string): Promise<PlexResource[]> {
  const res = await fetch(`${PLEX_TV_BASE}/api/v2/resources?includeHttps=1`, {
    headers: plexHeaders(clientId, token),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Failed to list Plex resources (${res.status})`);
  const resources: PlexResource[] = await res.json();
  return resources.filter((r) => r.provides.split(",").includes("server"));
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

export interface PlexMetadataItem {
  ratingKey: string;
  type: "movie" | "show" | string;
  title: string;
  addedAt: number;
  Guid?: { id: string }[];
  guid?: string;
  Media?: { Part?: { size?: number; file?: string }[] }[];
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

export async function getSectionItems(
  serverUri: string,
  token: string,
  sectionKey: string,
): Promise<PlexMetadataItem[]> {
  const res = await fetch(
    `${serverUri}/library/sections/${sectionKey}/all?includeGuids=1`,
    {
      headers: { Accept: "application/json", "X-Plex-Token": token },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
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
 * episodes carry a file — so both total size and a location have to be
 * derived from all of a show's episodes via Plex's "all leaves" endpoint. */
export async function getShowFileInfo(
  serverUri: string,
  token: string,
  ratingKey: string,
): Promise<{ sizeBytes: number | null; folderPath: string | null }> {
  const res = await fetch(`${serverUri}/library/metadata/${ratingKey}/allLeaves`, {
    headers: { Accept: "application/json", "X-Plex-Token": token },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) return { sizeBytes: null, folderPath: null };
  const body = await res.json();
  const episodes: PlexMetadataItem[] = body.MediaContainer?.Metadata ?? [];
  const total = episodes.reduce((sum, ep) => sum + (getFileSize(ep) ?? 0), 0);
  const episodePaths = episodes.map((ep) => getFilePath(ep)).filter((p): p is string => p !== null);
  return {
    sizeBytes: total > 0 ? total : null,
    folderPath: commonFolder(episodePaths),
  };
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
