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

  it("lists a title two media servers both have, even without paths", () => {
    const groups = findDuplicates([
      { copies: [copy("plex", null, "Tower"), copy("jellyfin", null, "Jelly")] },
      { copies: [copy("plex", "/a", "Tower"), copy("plex", "/a", "Attic")] },
    ]);
    expect(groups.map((g) => g.reason)).toEqual(["servers", "servers"]);
  });

  it("prefers the paths reason when both apply", () => {
    const groups = findDuplicates([{ copies: [copy("plex", "/a", "Tower"), copy("jellyfin", "/b", "Jelly")] }]);
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
