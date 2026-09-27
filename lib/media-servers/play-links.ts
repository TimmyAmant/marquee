// "Play on Plex" / "Play on Jellyfin" / "Play on Emby" on a title page: the
// links that open a title the library sync found on the household's media
// server (lib/media-servers/query.ts finds the items; this builds the
// URLs). Pure, so the URL shapes are unit tested.

import type { MediaType } from "@/lib/db/schema";
import type { MessageKey, Translator } from "@/lib/i18n/translator";

export type MediaServerKind = "plex" | "jellyfin" | "emby";

/** One place a title can be played, as the API sends it (`play` on
 * TitleDetail). `url` opens in a browser; `appUrl` is the server's own URL
 * scheme where it has one (Plex's `plex://`), for devices with the app. */
export type PlayLink = {
  server: MediaServerKind;
  /** The server's name as it calls itself ("Living room"), when known. */
  serverName: string | null;
  /** "Play on Plex", in the reader's language. */
  label: string;
  url: string;
  appUrl: string | null;
};

export const PLAY_LABELS: Record<MediaServerKind, MessageKey> = {
  plex: "title.playOnPlex",
  jellyfin: "title.playOnJellyfin",
  emby: "title.playOnEmby",
};

export function playLabel(t: Translator, server: MediaServerKind): string {
  return t(PLAY_LABELS[server]);
}

/** Plex Web, signed in to plex.tv: the title's preplay page on that server
 * — works from anywhere, no server address needed. */
export function plexWebUrl(machineIdentifier: string, ratingKey: string): string {
  const key = encodeURIComponent(`/library/metadata/${ratingKey}`);
  return `https://app.plex.tv/desktop/#!/server/${encodeURIComponent(machineIdentifier)}/details?key=${key}`;
}

/** The Plex apps' own scheme (iOS, Android, Apple TV, desktop): the same
 * preplay page. metadataType 1 is a movie, 2 a show. */
export function plexAppUrl(machineIdentifier: string, ratingKey: string, mediaType: MediaType): string {
  const key = encodeURIComponent(`/library/metadata/${ratingKey}`);
  const type = mediaType === "movie" ? 1 : 2;
  return `plex://preplay/?metadataKey=${key}&metadataType=${type}&server=${encodeURIComponent(machineIdentifier)}`;
}

function trimSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

/** Jellyfin's web client: the item's details page. Emby's web client has
 * the same page under a different route. */
export function jellyfinItemUrl(
  baseUrl: string,
  itemId: string,
  serverId: string | null,
  product: "jellyfin" | "emby" = "jellyfin",
): string {
  const base = trimSlash(baseUrl);
  const server = serverId ? `&serverId=${encodeURIComponent(serverId)}` : "";
  return product === "emby"
    ? `${base}/web/index.html#!/item?id=${encodeURIComponent(itemId)}${server}`
    : `${base}/web/index.html#!/details?id=${encodeURIComponent(itemId)}${server}`;
}

/** What a media server item, as the library sync stored it, links to. */
export type PlayableItem =
  | { server: "plex"; machineIdentifier: string; ratingKey: string; serverName: string | null }
  | {
      server: "jellyfin" | "emby";
      /** The address people reach the server at (its public URL when the
       * admin set one, else its base URL). */
      url: string;
      itemId: string;
      serverId: string | null;
      serverName: string | null;
    };

export function buildPlayLink(t: Translator, item: PlayableItem, mediaType: MediaType): PlayLink {
  if (item.server === "plex") {
    return {
      server: "plex",
      serverName: item.serverName,
      label: playLabel(t, "plex"),
      url: plexWebUrl(item.machineIdentifier, item.ratingKey),
      appUrl: plexAppUrl(item.machineIdentifier, item.ratingKey, mediaType),
    };
  }
  return {
    server: item.server,
    serverName: item.serverName,
    label: playLabel(t, item.server),
    url: jellyfinItemUrl(item.url, item.itemId, item.serverId, item.server),
    appUrl: null,
  };
}

/** One link per server, Plex first, each server once (a title in two Plex
 * libraries on one server is still one place to play it). */
export function buildPlayLinks(t: Translator, items: PlayableItem[], mediaType: MediaType): PlayLink[] {
  const seen = new Set<string>();
  const order: Record<MediaServerKind, number> = { plex: 0, jellyfin: 1, emby: 1 };
  return [...items]
    .sort((a, b) => order[a.server] - order[b.server])
    .filter((item) => {
      const key = item.server === "plex" ? `plex:${item.machineIdentifier}` : `${item.server}:${item.url}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((item) => buildPlayLink(t, item, mediaType));
}
