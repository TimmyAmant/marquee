import { describe, expect, it } from "vitest";
import { englishT } from "@/lib/i18n/catalog";
import { buildPlayLinks, jellyfinItemUrl, plexAppUrl, plexWebUrl } from "./play-links";

const t = englishT();

describe("play links", () => {
  it("builds Plex Web's preplay page for the server and rating key", () => {
    expect(plexWebUrl("abc123", "4521")).toBe(
      "https://app.plex.tv/desktop/#!/server/abc123/details?key=%2Flibrary%2Fmetadata%2F4521",
    );
  });

  it("builds the plex:// link with the media type", () => {
    expect(plexAppUrl("abc123", "4521", "movie")).toBe(
      "plex://preplay/?metadataKey=%2Flibrary%2Fmetadata%2F4521&metadataType=1&server=abc123",
    );
    expect(plexAppUrl("abc123", "77", "tv")).toContain("metadataType=2");
  });

  it("builds Jellyfin's and Emby's item pages, trimming a trailing slash", () => {
    expect(jellyfinItemUrl("https://jf.example.com/", "item1", "srv1")).toBe(
      "https://jf.example.com/web/index.html#!/details?id=item1&serverId=srv1",
    );
    expect(jellyfinItemUrl("http://emby:8096", "item1", null, "emby")).toBe(
      "http://emby:8096/web/index.html#!/item?id=item1",
    );
  });

  it("lists Plex first, one link per server, with a translated label", () => {
    const links = buildPlayLinks(
      t,
      [
        { server: "jellyfin", url: "http://jf:8096", itemId: "a", serverId: "s", serverName: "Den" },
        { server: "plex", machineIdentifier: "m1", ratingKey: "1", serverName: "Home" },
        { server: "plex", machineIdentifier: "m1", ratingKey: "2", serverName: "Home" },
      ],
      "tv",
    );
    expect(links.map((l) => l.server)).toEqual(["plex", "jellyfin"]);
    expect(links[0]).toMatchObject({ label: "Play on Plex", serverName: "Home" });
    expect(links[0].appUrl).toContain("plex://");
    expect(links[1]).toMatchObject({ label: "Play on Jellyfin", appUrl: null });
  });

  it("is empty when nothing is in a media server", () => {
    expect(buildPlayLinks(t, [], "movie")).toEqual([]);
  });
});
