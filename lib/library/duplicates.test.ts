import { describe, expect, it } from "vitest";
import { findDuplicates, normalizePath, type LibraryCopy } from "./duplicates-policy";

// Which titles the Duplicates tab lists (pure; the query is exercised in
// query.test.ts).

function copy(source: LibraryCopy["source"], filePath: string | null, server: string = source): LibraryCopy {
  return { source, server, filePath, sizeBytes: null, quality: null };
}

describe("findDuplicates", () => {
  it("lists a title whose copies name two different files", () => {
    const groups = findDuplicates([
      { name: "a", copies: [copy("radarr", "/movies/a/a.2160p.mkv"), copy("plex", "/movies/a/a.1080p.mkv")] },
    ]);
    expect(groups.map((g) => g.reason)).toEqual(["paths"]);
  });

  it("does not list an arr and a media server agreeing on one file", () => {
    expect(findDuplicates([{ copies: [copy("radarr", "/movies/a/a.mkv"), copy("plex", "/movies/a/a.mkv/")] }])).toEqual([]);
    expect(findDuplicates([{ copies: [copy("sonarr", "/tv/a"), copy("plex", "\\tv\\a")] }])).toEqual([]);
  });

  it("lists a title two servers of the same kind both have, even without paths", () => {
    const groups = findDuplicates([
      { copies: [copy("plex", null, "Tower"), copy("plex", null, "Attic")] },
      { copies: [copy("jellyfin", "/a", "Jelly"), copy("jellyfin", "/a", "Emby")] },
    ]);
    expect(groups.map((g) => g.reason)).toEqual(["servers", "servers"]);
  });

  it("does not list Plex and Jellyfin both having the same file", () => {
    expect(findDuplicates([{ copies: [copy("plex", "/data/Movies/a/a.mkv"), copy("jellyfin", "/media/movies/a/a.mkv")] }])).toEqual([]);
  });

  it("treats the same file under different container mounts as one file", () => {
    expect(
      findDuplicates([
        { copies: [copy("radarr", "/movies/2012 (2009)/2012 (2009).mp4"), copy("plex", "/data/Movies/2012 (2009)/2012 (2009).mp4")] },
        { copies: [copy("sonarr", "/tv/1923 (2022)/"), copy("plex", "/data/Tv Shows/1923 (2022)")] },
        { copies: [copy("radarr", "/movies/A/A.MKV"), copy("plex", "/data/movies/a/a.mkv")] },
      ]),
    ).toEqual([]);
  });

  it("matches a show's folder to the season folders and episodes inside it", () => {
    expect(
      findDuplicates([
        { mediaType: "tv", copies: [copy("sonarr", "/tv/Ahsoka (2023)/"), copy("plex", "/data/Tv Shows/Ahsoka (2023)/Season 01")] },
        { mediaType: "tv", copies: [copy("sonarr", "/tv/9-1-1 Nashville (2025)"), copy("plex", "/data/Tv Shows/9-1-1 Nashville (2025)/Season 1")] },
        { mediaType: "tv", copies: [copy("sonarr", "/tv/Andor"), copy("jellyfin", "/media/tv/Andor/Specials/Andor - S00E01.mkv")] },
        // A show's folder with dots in its name is still a folder.
        { mediaType: "tv", copies: [copy("sonarr", "/tv/The.Office.US"), copy("plex", "/data/Tv Shows/The.Office.US/Season 01")] },
      ]),
    ).toEqual([]);
  });

  it("still lists a show kept in two different folders", () => {
    const groups = findDuplicates([
      { mediaType: "tv" as const, copies: [copy("sonarr", "/tv/Ahsoka (2023)"), copy("plex", "/data/Tv Shows/Ahsoka/Season 01")] },
    ]);
    expect(groups.map((g) => g.reason)).toEqual(["paths"]);
  });

  it("keeps a movie's file name as the key, even next to a show's rules", () => {
    const groups = findDuplicates([
      { mediaType: "movie" as const, copies: [copy("radarr", "/movies/a/a.2160p.mkv"), copy("plex", "/data/Movies/a/a.1080p.mkv")] },
    ]);
    expect(groups.map((g) => g.reason)).toEqual(["paths"]);
  });

  it("prefers the paths reason when both apply", () => {
    const groups = findDuplicates([{ copies: [copy("plex", "/a", "Tower"), copy("plex", "/b", "Attic")] }]);
    expect(groups[0].reason).toBe("paths");
  });

  it("never lists a single copy, or an arr-only title", () => {
    expect(findDuplicates([{ copies: [copy("plex", "/a")] }, { copies: [copy("radarr", "/a"), copy("sonarr", null)] }, { copies: [] }])).toEqual([]);
  });
});

describe("normalizePath", () => {
  it("drops trailing slashes and Windows separators, keeps case", () => {
    expect(normalizePath(" /movies/A/ ")).toBe("/movies/A");
    expect(normalizePath("C:\\media\\a.mkv")).toBe("C:/media/a.mkv");
    expect(normalizePath("/a")).not.toBe(normalizePath("/A"));
  });
});
