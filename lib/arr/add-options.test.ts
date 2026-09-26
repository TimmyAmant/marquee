import { describe, expect, it } from "vitest";
import {
  hasOverrides,
  kindForMediaType,
  parseAddOverrides,
  parseAddOverridesForm,
  resolveAdd,
  serverDefaults,
} from "./add-options";

const sonarr = {
  kind: "sonarr" as const,
  qualityProfileId: 4,
  rootFolderPath: "/tv",
  tags: [2],
  seriesType: "daily" as const,
  animeQualityProfileId: 7,
  animeRootFolderPath: "/anime",
  animeTags: [3],
};

const radarr = {
  kind: "radarr" as const,
  qualityProfileId: 6,
  rootFolderPath: "/movies",
  tags: [1],
  seriesType: null,
  animeQualityProfileId: null,
  animeRootFolderPath: null,
  animeTags: [],
};

describe("serverDefaults", () => {
  it("uses a Sonarr's own settings for a regular show", () => {
    expect(serverDefaults(sonarr, false)).toEqual({
      qualityProfileId: 4,
      rootFolderPath: "/tv",
      tags: [2],
      seriesType: "daily",
    });
  });

  it("switches to the anime profile, folder, tags and series type for anime", () => {
    expect(serverDefaults(sonarr, true)).toEqual({
      qualityProfileId: 7,
      rootFolderPath: "/anime",
      tags: [3],
      seriesType: "anime",
    });
  });

  it("falls back to the regular settings where no anime one is set", () => {
    const plain = { ...sonarr, animeQualityProfileId: null, animeRootFolderPath: null, animeTags: [] };
    expect(serverDefaults(plain, true)).toEqual({
      qualityProfileId: 4,
      rootFolderPath: "/tv",
      tags: [2],
      seriesType: "anime",
    });
  });

  it("defaults a Sonarr with no series type to standard", () => {
    expect(serverDefaults({ ...sonarr, seriesType: null }, false).seriesType).toBe("standard");
  });

  it("ignores anime for Radarr and has no series type", () => {
    expect(serverDefaults(radarr, true)).toEqual({
      qualityProfileId: 6,
      rootFolderPath: "/movies",
      tags: [1],
      seriesType: null,
    });
  });

  it("hands out copies, so a caller can't change the server's tags", () => {
    const defaults = serverDefaults(sonarr, false);
    defaults.tags.push(99);
    expect(sonarr.tags).toEqual([2]);
  });
});

describe("resolveAdd", () => {
  it("lays the reviewer's picks over the defaults", () => {
    expect(resolveAdd(sonarr, true, { qualityProfileId: 9, tags: [5, 5, 6] })).toEqual({
      qualityProfileId: 9,
      rootFolderPath: "/anime",
      tags: [5, 6],
      seriesType: "anime",
    });
    expect(resolveAdd(sonarr, true, { seriesType: "standard", rootFolderPath: "/tv" })).toMatchObject({
      rootFolderPath: "/tv",
      seriesType: "standard",
    });
  });

  it("lets an empty tag list mean no tags", () => {
    expect(resolveAdd(radarr, false, { tags: [] }).tags).toEqual([]);
  });

  it("never gives a Radarr a series type", () => {
    expect(resolveAdd(radarr, false, { seriesType: "anime" }).seriesType).toBeNull();
  });

  it("with nothing picked is exactly the defaults", () => {
    expect(resolveAdd(sonarr, false)).toEqual(serverDefaults(sonarr, false));
  });
});

describe("parseAddOverrides", () => {
  it("reads every field", () => {
    expect(
      parseAddOverrides(
        { serverId: " abc ", qualityProfileId: 4, rootFolderPath: "/tv ", tags: [1, 2, 1], seriesType: "anime" },
        "tv",
      ),
    ).toEqual({
      ok: true,
      overrides: { serverId: "abc", qualityProfileId: 4, rootFolderPath: "/tv", tags: [1, 2], seriesType: "anime" },
    });
  });

  it("treats absent, null and blank as the default", () => {
    expect(parseAddOverrides({}, "movie")).toEqual({ ok: true, overrides: {} });
    expect(parseAddOverrides({ serverId: null, qualityProfileId: null, tags: null }, "movie")).toEqual({
      ok: true,
      overrides: {},
    });
    expect(parseAddOverrides({ serverId: "  ", rootFolderPath: "" }, "movie")).toEqual({ ok: true, overrides: {} });
  });

  it("ignores series type for a movie", () => {
    expect(parseAddOverrides({ seriesType: "nonsense" }, "movie")).toEqual({ ok: true, overrides: {} });
  });

  it("refuses the wrong types with the documented messages", () => {
    expect(parseAddOverrides({ serverId: 5 }, "tv")).toEqual({ ok: false, error: '"serverId" must be a string.' });
    expect(parseAddOverrides({ qualityProfileId: "4" }, "tv")).toEqual({
      ok: false,
      error: '"qualityProfileId" must be a number.',
    });
    expect(parseAddOverrides({ qualityProfileId: 0 }, "tv").ok).toBe(false);
    expect(parseAddOverrides({ rootFolderPath: 3 }, "tv")).toEqual({
      ok: false,
      error: '"rootFolderPath" must be a string.',
    });
    expect(parseAddOverrides({ tags: [1, "2"] }, "tv")).toEqual({ ok: false, error: '"tags" must be a list of numbers.' });
    expect(parseAddOverrides({ tags: "1" }, "tv").ok).toBe(false);
    expect(parseAddOverrides({ seriesType: "weekly" }, "tv")).toEqual({
      ok: false,
      error: '"seriesType" must be standard, daily or anime.',
    });
  });
});

describe("parseAddOverridesForm", () => {
  function form(fields: [string, string][]) {
    const data = new FormData();
    for (const [key, value] of fields) data.append(key, value);
    return data;
  }

  it("sends nothing unless the Advanced section was opened", () => {
    expect(parseAddOverridesForm(form([["serverId", "abc"], ["tags", "1"]]), "tv")).toEqual({ ok: true, overrides: {} });
  });

  it("reads the opened section's fields, repeated tags included", () => {
    expect(
      parseAddOverridesForm(
        form([
          ["advanced", "1"],
          ["serverId", "abc"],
          ["qualityProfileId", "6"],
          ["rootFolderPath", "/kids"],
          ["tags", "1"],
          ["tags", "3"],
          ["seriesType", "daily"],
        ]),
        "tv",
      ),
    ).toEqual({
      ok: true,
      overrides: { serverId: "abc", qualityProfileId: 6, rootFolderPath: "/kids", tags: [1, 3], seriesType: "daily" },
    });
  });

  it("an opened section with no tags ticked means no tags", () => {
    expect(parseAddOverridesForm(form([["advanced", "1"], ["serverId", "abc"]]), "movie")).toEqual({
      ok: true,
      overrides: { serverId: "abc", tags: [] },
    });
  });

  it("refuses a profile that isn't a number", () => {
    expect(parseAddOverridesForm(form([["advanced", "1"], ["qualityProfileId", "HD"]]), "movie").ok).toBe(false);
  });
});

describe("helpers", () => {
  it("knows which kind a media type goes to", () => {
    expect(kindForMediaType("movie")).toBe("radarr");
    expect(kindForMediaType("tv")).toBe("sonarr");
  });

  it("knows whether anything was picked", () => {
    expect(hasOverrides(null)).toBe(false);
    expect(hasOverrides({})).toBe(false);
    expect(hasOverrides({ tags: [] })).toBe(true);
    expect(hasOverrides({ serverId: "x" })).toBe(true);
  });
});
