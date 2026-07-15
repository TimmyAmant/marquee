const PLEX_TV_BASE = "https://plex.tv";
const PRODUCT = "Marquee";

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
  });
  if (!res.ok) throw new Error(`Failed to create Plex pin (${res.status})`);
  return res.json();
}

export async function checkPin(clientId: string, pinId: number): Promise<PlexPin> {
  const res = await fetch(`${PLEX_TV_BASE}/api/v2/pins/${pinId}`, {
    headers: plexHeaders(clientId),
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
  Media?: { Part?: { size?: number }[] }[];
}

export function getFileSize(item: PlexMetadataItem): number | null {
  return item.Media?.[0]?.Part?.[0]?.size ?? null;
}

export async function getSectionItems(
  serverUri: string,
  token: string,
  sectionKey: string,
): Promise<PlexMetadataItem[]> {
  const res = await fetch(
    `${serverUri}/library/sections/${sectionKey}/all?includeGuids=1`,
    { headers: { Accept: "application/json", "X-Plex-Token": token } },
  );
  if (!res.ok) throw new Error(`Failed to list section items (${res.status})`);
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
