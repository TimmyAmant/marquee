export type JellyfinConfig = { baseUrl: string; apiKey: string };

async function jellyfinFetch<T>(config: JellyfinConfig, path: string): Promise<T> {
  const url = new URL(`${config.baseUrl.replace(/\/$/, "")}${path}`);
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "X-Emby-Token": config.apiKey,
    },
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
}

export function testConnection(config: JellyfinConfig): Promise<JellyfinSystemInfo> {
  return jellyfinFetch<JellyfinSystemInfo>(config, "/System/Info");
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
  MediaSources?: { Size?: number }[];
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
  );
  return body.Items ?? [];
}

export function getFileSize(item: JellyfinItem): number | null {
  return item.MediaSources?.[0]?.Size ?? null;
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
