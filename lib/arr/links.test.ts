import { describe, expect, it } from "vitest";
import { arrLinkBase, arrLinkNames, arrTitleLink, arrTitlePath, seesArrLinks } from "./links";

const radarr = { kind: "radarr" as const, name: "Radarr", is4k: false, baseUrl: "http://radarr:7878", publicUrl: null };
const sonarr = { kind: "sonarr" as const, name: "Sonarr", is4k: false, baseUrl: "http://sonarr:8989", publicUrl: null };

describe("arrTitlePath", () => {
  it("links a movie by Radarr's titleSlug", () => {
    expect(arrTitlePath("radarr", { titleSlug: "603", tmdbId: 603 })).toBe("/movie/603");
    // Radarr v3 still had word slugs.
    expect(arrTitlePath("radarr", { titleSlug: "the-matrix-603", tmdbId: 603 })).toBe("/movie/the-matrix-603");
  });

  it("falls back to the TMDb id when Radarr sends no slug", () => {
    expect(arrTitlePath("radarr", { titleSlug: undefined, tmdbId: 603 })).toBe("/movie/603");
    expect(arrTitlePath("radarr", { titleSlug: "  ", tmdbId: 603 })).toBe("/movie/603");
    expect(arrTitlePath("radarr", { titleSlug: null, tmdbId: null })).toBeNull();
  });

  it("links a series by Sonarr's titleSlug, and not at all without one", () => {
    expect(arrTitlePath("sonarr", { titleSlug: "severance" })).toBe("/series/severance");
    expect(arrTitlePath("sonarr", { titleSlug: undefined, tmdbId: 95396 })).toBeNull();
  });

  it("escapes anything odd in a slug", () => {
    expect(arrTitlePath("sonarr", { titleSlug: "what/if?" })).toBe("/series/what%2Fif%3F");
  });
});

describe("arrLinkBase", () => {
  it("uses the server's URL, without trailing slashes", () => {
    expect(arrLinkBase({ baseUrl: "http://radarr:7878///" })).toBe("http://radarr:7878");
    expect(arrLinkBase({ baseUrl: "http://nas.lan/radarr/" })).toBe("http://nas.lan/radarr");
  });

  it("prefers the public URL when there is one", () => {
    expect(arrLinkBase({ baseUrl: "http://radarr:7878", publicUrl: "https://radarr.example.com/" })).toBe(
      "https://radarr.example.com",
    );
    expect(arrLinkBase({ baseUrl: "http://radarr:7878", publicUrl: "  " })).toBe("http://radarr:7878");
    expect(arrLinkBase({ baseUrl: "http://radarr:7878", publicUrl: null })).toBe("http://radarr:7878");
  });
});

describe("arrTitleLink", () => {
  it("builds the whole link for a movie and a series", () => {
    expect(arrTitleLink(radarr, { titleSlug: "603", tmdbId: 603 })).toEqual({
      kind: "radarr",
      serverName: "Radarr",
      is4k: false,
      url: "http://radarr:7878/movie/603",
    });
    expect(
      arrTitleLink({ ...sonarr, publicUrl: "https://tv.example.com/sonarr/" }, { titleSlug: "severance" }),
    ).toEqual({ kind: "sonarr", serverName: "Sonarr", is4k: false, url: "https://tv.example.com/sonarr/series/severance" });
  });

  it("gives no link for a series without a slug", () => {
    expect(arrTitleLink(sonarr, {})).toBeNull();
  });
});

describe("arrLinkNames", () => {
  it("names a lone server by its kind, 4K ones as such", () => {
    expect(
      arrLinkNames([
        { kind: "radarr", serverName: "Movies", is4k: false },
        { kind: "radarr", serverName: "Movies UHD", is4k: true },
      ]),
    ).toEqual(["Radarr", "Radarr 4K"]);
  });

  it("uses the servers' own names when several of one kind and 4K-ness have it", () => {
    expect(
      arrLinkNames([
        { kind: "sonarr", serverName: "Sonarr", is4k: false },
        { kind: "sonarr", serverName: "Anime", is4k: false },
        { kind: "sonarr", serverName: "4K Sonarr", is4k: true },
      ]),
    ).toEqual(["Sonarr", "Anime", "Sonarr 4K"]);
  });
});

describe("seesArrLinks", () => {
  it("is the admin and whoever may review requests", () => {
    expect(seesArrLinks({ role: "admin", permissions: [] })).toBe(true);
    expect(seesArrLinks({ role: "member", permissions: ["reviewRequests"] })).toBe(true);
  });

  it("is never a member without it, nor someone signed out", () => {
    expect(seesArrLinks({ role: "member", permissions: ["requestMovies", "viewRequests", "advancedRequests"] })).toBe(false);
    expect(seesArrLinks(null)).toBe(false);
  });
});
